import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type AccountResult = { ok: true; userId: string } | { ok: false; error: string };

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

export type ClaimPreview = {
  displayName: string;
  yapCount: number;
  totalAura: number;
};

/**
 * Registering with the display name of someone who is already quoted but has
 * no account claims that person's record. It is the only way those statements
 * ever get an owner, and it hinges on typing the name the same way — so the
 * form says so before anyone commits to a spelling.
 *
 * The search is confined to the team whose invite is being redeemed. Two teams
 * may each quote a Diana, and neither Diana gets to claim the other.
 */
export async function previewClaim(
  displayName: string,
  teamId: string,
): Promise<ClaimPreview | null> {
  const name = displayName.trim();
  if (name.length < 2) return null;

  const existing = await prisma.user.findFirst({
    where: {
      displayName: { equals: name, mode: "insensitive" },
      username: null,
      memberships: { some: { teamId } },
    },
    select: { id: true, displayName: true },
  });
  if (!existing) return null;

  const stats = await prisma.yap.aggregate({
    where: { teamId, authorId: existing.id, deletedAt: null },
    _count: { _all: true },
    _sum: { aura: true },
  });

  return {
    displayName: existing.displayName,
    yapCount: stats._count._all,
    totalAura: stats._sum.aura ?? 0,
  };
}

/**
 * Everything that can reject a registration, without writing anything.
 *
 * Split out so the invite flow can check the form *before* spending a seat:
 * creating the account first and taking the seat afterwards meant two people
 * racing for the last one both ended up inside.
 */
export async function validateRegistration(
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const login = username.trim().toLowerCase();
  if (!USERNAME_RE.test(login)) {
    return { ok: false, error: "Username must be 3–24 characters: letters, numbers, . _ -" };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const taken = await prisma.user.findUnique({ where: { username: login } });
  if (taken) return { ok: false, error: "That username is already on the record." };
  return { ok: true };
}

export async function registerAccount(
  username: string,
  password: string,
  displayName: string,
  teamId: string,
): Promise<AccountResult> {
  const login = username.trim().toLowerCase();
  const valid = await validateRegistration(username, password);
  if (!valid.ok) return valid;

  const name = displayName.trim() || login;
  const passwordHash = await hashPassword(password);

  // A yapper may already exist in the archive without credentials — let them
  // claim the account rather than creating a duplicate person.
  const existing = await prisma.user.findFirst({
    where: {
      displayName: { equals: name, mode: "insensitive" },
      username: null,
      memberships: { some: { teamId } },
    },
  });

  if (existing) {
    const claimed = await prisma.user.update({
      where: { id: existing.id },
      data: { username: login, passwordHash },
    });
    return { ok: true, userId: claimed.id };
  }

  const created = await prisma.user.create({
    data: {
      username: login,
      passwordHash,
      displayName: name,
      memberships: { create: { teamId } },
    },
  });
  return { ok: true, userId: created.id };
}

/** An existing account redeeming an invite for a team it is not in yet. */
export async function joinTeam(userId: string, teamId: string): Promise<void> {
  await prisma.membership.upsert({
    where: { teamId_userId: { teamId, userId } },
    update: {},
    create: { teamId, userId },
  });
}

export async function authenticate(username: string, password: string): Promise<AccountResult> {
  const login = username.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { username: login } });
  if (!user?.passwordHash) return { ok: false, error: "Unknown yapper or wrong password." };
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, error: "Unknown yapper or wrong password." };
  return { ok: true, userId: user.id };
}
