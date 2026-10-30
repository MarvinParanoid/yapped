import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import type { Failure } from "@/lib/errors";

/**
 * Getting back in without an email address.
 *
 * This archive has never held an email address and sends no mail, so the usual
 * "check your inbox" has nothing to work with. What it does have is a team of
 * people who already talk to each other and an owner who can prove who is who
 * by asking. So a reset is a link, minted by someone who administers the team
 * and handed over in the chat — the same trust model, and the same shape, as an
 * invitation.
 *
 * Two things the issuer deliberately does not get: the new password, which only
 * the link's holder ever types, and a second live link, because every earlier
 * one for that person is spent the moment a new one is made.
 */

/** Long enough that guessing is hopeless, short enough to paste into a chat. */
function mintToken(): string {
  return randomBytes(24).toString("hex");
}

/** A day is long enough for someone to read a message and act on it. */
export const RESET_HOURS = 24;

export type ResetState =
  | { ok: true; token: string }
  | ({ ok: false } & Failure);

export type ResetSubject =
  | { ok: true; userId: string; displayName: string; username: string }
  | { ok: false; reason: "UNKNOWN" | "EXPIRED" | "SPENT" };

/**
 * Spent and expired links are not kept. There is no report that wants them and
 * a stale row is one more thing that could be made to work again by accident.
 */
async function sweep(userId: string): Promise<void> {
  await prisma.passwordReset.deleteMany({
    where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
  });
}

/**
 * Issue a link for one member of one team. The caller has already established
 * that whoever asked may administer that team; this checks the subject really
 * is in it, because a team id and a user id arriving together prove nothing
 * about each other.
 */
export async function issueReset(input: {
  teamId: string;
  userId: string;
  issuedById: string;
  /** Whether the issuer holds the instance role, which widens what they may do. */
  issuerIsOperator: boolean;
}): Promise<ResetState> {
  const membership = await prisma.membership.findUnique({
    where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
    include: {
      user: { select: { username: true, role: true, _count: { select: { memberships: true } } } },
    },
  });
  if (!membership) return { ok: false, code: "NOT_A_MEMBER" };
  // Someone who was only ever quoted has no password to reset — they claim
  // their records by registering, which is a different door.
  if (!membership.user.username) return { ok: false, code: "NO_ACCOUNT_YET" };

  // A password is one per account, not one per archive, so setting it reaches
  // everywhere that account goes. Issuing a link is therefore only a team
  // decision while the account is only in this team — otherwise one archive's
  // owner would be deciding who gets into another archive they have never
  // been invited to. The instance operator may do it, because the operator can
  // already enter any archive and the header says so.
  if (!input.issuerIsOperator) {
    if (membership.user._count.memberships > 1) {
      return { ok: false, code: "RESET_CROSSES_ARCHIVES" };
    }
    // And never hand out the keys to the person who holds the instance.
    if (membership.user.role === "ADMIN") {
      return { ok: false, code: "RESET_OPERATOR_ONLY" };
    }
  }

  await sweep(input.userId);

  const token = mintToken();
  await prisma.passwordReset.create({
    data: {
      token,
      userId: input.userId,
      teamId: input.teamId,
      issuedById: input.issuedById,
      expiresAt: new Date(Date.now() + RESET_HOURS * 60 * 60 * 1000),
    },
  });
  return { ok: true, token };
}

/** Who a link is for, so the page can say so before anyone types a password. */
export async function inspectReset(token: string): Promise<ResetSubject> {
  const reset = await prisma.passwordReset.findUnique({
    where: { token },
    include: { user: { select: { id: true, displayName: true, username: true } } },
  });
  if (!reset || !reset.user.username) return { ok: false, reason: "UNKNOWN" };
  if (reset.usedAt) return { ok: false, reason: "SPENT" };
  if (reset.expiresAt < new Date()) return { ok: false, reason: "EXPIRED" };
  return {
    ok: true,
    userId: reset.user.id,
    displayName: reset.user.displayName,
    username: reset.user.username,
  };
}

/**
 * Spend the link and set the password.
 *
 * Every session that account had is ended with it. Whoever needed this link
 * could not get in, so a session that still works is either a device they have
 * forgotten about or somebody else's — and both are reasons to sign out, not
 * reasons to keep it.
 */
export async function consumeReset(
  token: string,
  password: string,
): Promise<{ ok: true; userId: string } | ({ ok: false } & Failure)> {
  if (password.length < 8) return { ok: false, code: "PASSWORD_SHORT" };

  const subject = await inspectReset(token);
  if (!subject.ok) return { ok: false, code: "RESET_UNUSABLE" };

  const passwordHash = await hashPassword(password);

  try {
    await prisma.$transaction(async (tx) => {
      // Conditional, so two people holding the same link cannot both spend it.
      const spent = await tx.passwordReset.updateMany({
        where: { token, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (spent.count !== 1) throw new Error("RESET_UNUSABLE");

      await tx.user.update({ where: { id: subject.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: subject.userId } });
    });
  } catch {
    return { ok: false, code: "RESET_UNUSABLE" };
  }

  return { ok: true, userId: subject.userId };
}
