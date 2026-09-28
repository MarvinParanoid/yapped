import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Invites are the only door into an archive. A token is a bearer credential —
 * anyone holding the link is treated as invited — so the interesting work here
 * is all in deciding when a token stops being one: it can expire, it can run
 * out of uses, and it can be pulled back by hand.
 */

export type InviteState =
  | { ok: true; teamId: string; teamName: string; teamSlug: string; token: string }
  | { ok: false; reason: "UNKNOWN" | "REVOKED" | "EXPIRED" | "EXHAUSTED" };

export type InviteRow = {
  token: string;
  note: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdById: string | null;
  createdBy: string | null;
  /** Why the link no longer works, or null while it still does. */
  deadReason: "REVOKED" | "EXPIRED" | "EXHAUSTED" | null;
};

/** 24 hex characters: short enough to paste into a chat, long enough to be unguessable. */
function mintToken(): string {
  return randomBytes(12).toString("hex");
}

function deadReason(invite: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
}): "REVOKED" | "EXPIRED" | "EXHAUSTED" | null {
  if (invite.revokedAt) return "REVOKED";
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) return "EXPIRED";
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return "EXHAUSTED";
  return null;
}

/** Read a token without spending it — the landing page needs this. */
export async function inspectInvite(token: string): Promise<InviteState> {
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { team: true },
  });
  if (!invite) return { ok: false, reason: "UNKNOWN" };

  const dead = deadReason(invite);
  if (dead) return { ok: false, reason: dead };

  return {
    ok: true,
    teamId: invite.teamId,
    teamName: invite.team.name,
    teamSlug: invite.team.slug,
    token: invite.token,
  };
}

/**
 * Spend one use, atomically.
 *
 * The conditional `updateMany` is the whole point: two people opening the last
 * seat of a link at the same moment both pass `inspectInvite`, and exactly one
 * of them matches this WHERE clause.
 */
export async function consumeInvite(token: string): Promise<InviteState> {
  const state = await inspectInvite(token);
  if (!state.ok) return state;

  const invite = await prisma.invite.findUniqueOrThrow({ where: { token } });
  const spent = await prisma.invite.updateMany({
    where: {
      token,
      revokedAt: null,
      uses: invite.uses,
      ...(invite.maxUses !== null ? { uses: { lt: invite.maxUses } } : {}),
    },
    data: { uses: { increment: 1 } },
  });
  if (spent.count === 0) return { ok: false, reason: "EXHAUSTED" };

  return state;
}

/**
 * Hand a spent seat back, when whatever the caller took it for then failed.
 * Never below zero, and never a way to un-revoke a link.
 */
export async function releaseInvite(token: string): Promise<void> {
  await prisma.invite.updateMany({
    where: { token, uses: { gt: 0 } },
    data: { uses: { decrement: 1 } },
  });
}

/** Nothing at all means "no limit"; anything present must be a real limit. */
export const MAX_USES_CAP = 100;
export const MAX_DAYS_CAP = 365;

function bounded(value: number | null | undefined, cap: number, code: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 1 || value > cap) throw new Error(code);
  return value;
}

export async function createInvite(input: {
  teamId: string;
  createdById: string;
  note?: string | null;
  maxUses?: number | null;
  expiresInDays?: number | null;
}): Promise<string> {
  // A limit that cannot be understood is refused, never quietly widened. The
  // old code coerced 0, -5 and NaN to null, and null means UNLIMITED — so a
  // typo in the uses box produced the most permissive link available, which is
  // the exact opposite of what the person typing "0" was asking for.
  const maxUses = bounded(input.maxUses, MAX_USES_CAP, "INVITE_USES_INVALID");
  const expiresInDays = bounded(input.expiresInDays, MAX_DAYS_CAP, "INVITE_DAYS_INVALID");

  const token = mintToken();
  await prisma.invite.create({
    data: {
      token,
      teamId: input.teamId,
      createdById: input.createdById,
      note: input.note?.trim() || null,
      maxUses,
      expiresAt:
        expiresInDays === null
          ? null
          : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export async function listInvites(teamId: string): Promise<InviteRow[]> {
  const rows = await prisma.invite.findMany({
    where: { teamId },
    include: { createdBy: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    token: row.token,
    note: row.note,
    maxUses: row.maxUses,
    uses: row.uses,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    createdById: row.createdById,
    createdBy: row.createdBy?.displayName ?? null,
    deadReason: deadReason(row),
  }));
}

/**
 * Scoped by team so an admin cannot revoke a link they cannot see.
 *
 * `onlyCreatedBy` narrows it further: an ordinary member may pull back the
 * links they handed out, and nobody else's.
 */
export async function revokeInvite(
  token: string,
  teamId: string,
  onlyCreatedBy?: string,
): Promise<boolean> {
  const result = await prisma.invite.updateMany({
    where: {
      token,
      teamId,
      revokedAt: null,
      ...(onlyCreatedBy ? { createdById: onlyCreatedBy } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/** The links one person handed out — what a member sees on their own page. */
export async function listInvitesBy(teamId: string, createdById: string): Promise<InviteRow[]> {
  const rows = await listInvites(teamId);
  return rows.filter((row) => row.createdById === createdById);
}
