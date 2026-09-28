"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import {
  canModerate,
  getViewer,
  listMemberships,
  requireOperator,
  requireTeamAdmin,
  requireViewer,
  TEAM_COOKIE,
} from "@/lib/auth/team";
import { slugifyTag } from "@/lib/format";
import type { Failure } from "@/lib/errors";
import { NAME_MAX, NAME_MIN } from "@/lib/names";
import { fill } from "@/lib/i18n/locale";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/server";
import type { ReactionKey } from "@/lib/ranking/aura";
import {
  authenticate,
  joinTeam,
  previewClaim,
  registerAccount,
  validateRegistration,
  type ClaimPreview,
} from "@/lib/services/accounts";
import {
  consumeInvite,
  createInvite,
  inspectInvite,
  releaseInvite,
  revokeInvite,
} from "@/lib/services/invites";
import { createTeam, removeMember, renameTeam, setMemberRole } from "@/lib/services/teams";
import type { TeamRole } from "@/lib/auth/team";
import { recordBattle } from "@/lib/services/battles";
import { addYapToCase, createCase } from "@/lib/services/cases";
import { attachEvidence, isAcceptedImage, MAX_EVIDENCE_BYTES } from "@/lib/services/evidence";
import {
  acknowledgeYap,
  createYap,
  disputeYap,
  setWitnessStance,
  withdrawAcknowledgement,
  softDeleteYap,
  toggleReaction,
  withdrawDispute,
  editYap,
  restoreYap,
  type ToggleResult,
  type WitnessState,
} from "@/lib/services/yaps";
import { findOrCreateYapper, syncAchievements } from "@/lib/services/yappers";

export type ReactionResult =
  | { ok: true; state: ToggleResult }
  | { ok: false; error: "AUTH_REQUIRED" | "AUTHOR_CANNOT_REACT" | "FAILED" };

export async function reactAction(yapId: number, type: ReactionKey): Promise<ReactionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "AUTH_REQUIRED" };
  try {
    const state = await toggleReaction(yapId, viewer.team.id, viewer.user.id, type);
    return { ok: true, state };
  } catch (error) {
    if (error instanceof Error && error.message === "AUTHOR_CANNOT_REACT") {
      return { ok: false, error: "AUTHOR_CANNOT_REACT" };
    }
    return { ok: false, error: "FAILED" };
  }
}

export type WitnessResult =
  | { ok: true; state: WitnessState }
  | { ok: false; error: "AUTH_REQUIRED" | "AUTHOR_CANNOT_WITNESS" | "FAILED" };

/** I WAS THERE / CAP. Pressing the same position again withdraws it. */
export async function witnessAction(
  yapId: number,
  stance: "PRESENT" | "DENIED",
): Promise<WitnessResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "AUTH_REQUIRED" };
  try {
    return { ok: true, state: await setWitnessStance(yapId, viewer.team.id, viewer.user.id, stance) };
  } catch (error) {
    if (error instanceof Error && error.message === "AUTHOR_CANNOT_WITNESS") {
      return { ok: false, error: "AUTHOR_CANNOT_WITNESS" };
    }
    return { ok: false, error: "FAILED" };
  }
}

/** I SAID THAT — the author's side of the record. */
export async function acknowledgeAction(yapId: number): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  const result = await acknowledgeYap(yapId, viewer.team.id, viewer.user.id);
  if (result.ok) revalidatePath(`/yap/${yapId}`);
  return { ok: result.ok };
}

export async function withdrawAcknowledgementAction(yapId: number): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  const result = await withdrawAcknowledgement(yapId, viewer.team.id, viewer.user.id);
  if (result.ok) revalidatePath(`/yap/${yapId}`);
  return result;
}

/** Only the person a record is about may contest it. */
export async function disputeAction(
  yapId: number,
  statement: string,
): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  const result = await disputeYap(yapId, viewer.team.id, viewer.user.id, statement);
  if (result.ok) revalidatePath(`/yap/${yapId}`);
  return { ok: result.ok };
}

export async function withdrawDisputeAction(yapId: number): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  const result = await withdrawDispute(yapId, viewer.team.id, viewer.user.id);
  if (result.ok) revalidatePath(`/yap/${yapId}`);
  return result;
}

/** Group records into a documented episode. */
export async function fileUnderCaseAction(
  yapId: number,
  caseId: number,
): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  await addYapToCase(caseId, yapId, viewer.team.id);
  revalidatePath(`/yap/${yapId}`);
  revalidatePath(`/case/${caseId}`);
  return { ok: true };
}

export async function openCaseAction(
  yapId: number,
  title: string,
): Promise<{ ok: boolean; caseId?: number }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  if (title.trim().length < 3) return { ok: false };
  const caseId = await createCase({ teamId: viewer.team.id, title, createdById: viewer.user.id, yapId });
  revalidatePath(`/yap/${yapId}`);
  revalidatePath("/cases");
  return { ok: true, caseId };
}

export type SubmitState = { error?: string };

/**
 * Turns a refusal into a sentence in whichever language the person is reading.
 *
 * Services return codes; this is the one place a code becomes words, so the
 * same refusal cannot be worded two ways in two forms.
 */
async function say(failure: Failure): Promise<string> {
  const d = await getDictionary();
  return fill(d.errors[failure.code], failure.vars ?? {});
}

export async function submitYapAction(
  _previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const viewer = await getViewer();
  if (!viewer) return { error: await say({ code: "AUTH_REQUIRED" }) };
  const teamId = viewer.team.id;

  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 2) return { error: await say({ code: "TEXT_TOO_SHORT" }) };
  if (text.length > 400) return { error: await say({ code: "TEXT_TOO_LONG" }) };

  const existingAuthorId = String(formData.get("authorId") ?? "").trim();
  const newAuthorName = String(formData.get("authorName") ?? "").trim();
  if (!existingAuthorId && !newAuthorName) return { error: await say({ code: "AUTHOR_MISSING" }) };

  let authorId: string;
  try {
    authorId = existingAuthorId || (await findOrCreateYapper(newAuthorName, teamId));
  } catch (error) {
    // findOrCreateYapper rejects a name the archive will not print.
    // findOrCreateYapper throws the code; the numbers are the module's own
    // constants, so they can be filled in here.
    const code = error instanceof Error ? error.message : "NAME_UNREADABLE";
    const n = code === "NAME_SHORT" ? NAME_MIN : NAME_MAX;
    return { error: await say({ code: code as Failure["code"], vars: { n } }) };
  }

  const saidAtRaw = String(formData.get("saidAt") ?? "").trim();
  const saidAt = saidAtRaw ? new Date(saidAtRaw) : new Date();
  if (Number.isNaN(saidAt.getTime())) return { error: await say({ code: "DATE_INVALID" }) };
  if (saidAt.getTime() > Date.now() + 60_000) return { error: await say({ code: "DATE_FUTURE" }) };

  const tags = String(formData.get("tags") ?? "")
    .split(/[,\s]+/)
    .map(slugifyTag)
    .filter(Boolean)
    .slice(0, 6);

  const lore = String(formData.get("lore") ?? "").trim();

  let yapId: number;
  try {
    yapId = await createYap({
      teamId,
      text,
      authorId,
      submittedById: viewer.user.id,
      lore,
      saidAt,
      tags,
    });
  } catch {
    return { error: await say({ code: "REFUSED" }) };
  }

  const evidence = formData.get("evidence");
  if (evidence instanceof File && evidence.size > 0) {
    if (!isAcceptedImage(evidence.type)) {
      return { error: await say({ code: "EVIDENCE_TYPE" }) };
    }
    if (evidence.size > MAX_EVIDENCE_BYTES) {
      return { error: await say({ code: "EVIDENCE_SIZE" }) };
    }
    try {
      await attachEvidence(yapId, {
        buffer: Buffer.from(await evidence.arrayBuffer()),
        mimeType: evidence.type,
      });
    } catch {
      // The yap stands even if the exhibit does not.
    }
  }

  await syncAchievements(authorId, teamId);
  revalidatePath("/");
  redirect(`/yap/${yapId}?yapped=1`);
}

export async function deleteYapAction(yapId: number): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  const ok = await softDeleteYap(yapId, viewer.team.id, viewer.user.id);
  if (ok) {
    revalidatePath("/");
    revalidatePath(`/yap/${yapId}`);
  }
  return { ok };
}

/**
 * Correct a misquote. The archive keeps what was said, so the wording is the
 * one thing worth being able to fix — everything the record has earned since
 * stays put.
 */
export async function editYapAction(
  yapId: number,
  text: string,
  lore: string,
): Promise<{ ok: boolean; error?: string }> {
  const viewer = await requireViewer("/admin");
  const trimmed = text.trim();
  if (trimmed.length < 2) return { ok: false, error: await say({ code: "TEXT_TOO_SHORT" }) };
  if (trimmed.length > 400) return { ok: false, error: await say({ code: "TEXT_TOO_LONG" }) };

  const result = await editYap(yapId, viewer.team.id, viewer.user.id, { text: trimmed, lore });
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath(`/yap/${yapId}`);
  }
  return result.ok ? { ok: true } : { ok: false, error: await say({ code: "REFUSED" }) };
}

/** Admin panel: put a redacted record back on the shelf. */
export async function restoreYapAction(yapId: number): Promise<{ ok: boolean }> {
  const viewer = await requireTeamAdmin("/admin");
  const ok = await restoreYap(yapId, viewer.team.id, viewer.user.id);
  if (ok) {
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath(`/yap/${yapId}`);
  }
  return { ok };
}

export type BattleVoteResult = {
  ok: boolean;
  delta?: number;
  upset?: boolean;
  gap?: number;
};

export async function battleVoteAction(
  winnerId: number,
  loserId: number,
): Promise<BattleVoteResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  const outcome = await recordBattle(winnerId, loserId, viewer.team.id, viewer.user.id);
  return { ok: true, delta: outcome?.delta, upset: outcome?.upset, gap: outcome?.gap };
}

export type AuthState = { error?: string };

/**
 * What registering under this name would take over, if anything.
 *
 * The invite token decides which archive is searched, so this never reports on
 * a team the caller has not been invited to.
 */
export async function previewClaimAction(
  displayName: string,
  token: string,
): Promise<ClaimPreview | null> {
  const invite = await inspectInvite(token);
  if (!invite.ok) return null;
  return previewClaim(displayName, invite.teamId);
}

export async function loginAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await authenticate(username, password);
  if (!result.ok) return { error: await say(result) };
  await createSession(result.userId);
  redirect(String(formData.get("next") || "/"));
}

/** Registration is only reachable through an invite, so the token comes first. */
export async function registerAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");

  const invite = await inspectInvite(token);
  if (!invite.ok) return { error: INVITE_ERRORS[invite.reason] };

  // Order matters. Check the form first, so a rejected password does not burn a
  // single-use link; then take the seat, so two people racing for the last one
  // cannot both get in; only then create the account. Creating it first meant
  // the loser of that race was already a member by the time they saw the error.
  const valid = await validateRegistration(username, password);
  if (!valid.ok) return { error: await say(valid) };

  const spent = await consumeInvite(token);
  if (!spent.ok) return { error: INVITE_ERRORS[spent.reason] };

  const result = await registerAccount(username, password, displayName, invite.teamId);
  if (!result.ok) {
    // The seat was never used; give it back rather than silently eating it.
    await releaseInvite(token);
    return { error: await say(result) };
  }

  await createSession(result.userId);
  await setTeamCookie(invite.teamSlug);
  redirect("/");
}

const INVITE_ERRORS: Record<"UNKNOWN" | "REVOKED" | "EXPIRED" | "EXHAUSTED", string> = {
  UNKNOWN: "That invite does not exist.",
  REVOKED: "That invite has been revoked.",
  EXPIRED: "That invite has expired.",
  EXHAUSTED: "That invite has been used up.",
};

async function setTeamCookie(slug: string): Promise<void> {
  const jar = await cookies();
  jar.set(TEAM_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** An existing account redeeming a link for a team it is not in yet. */
export async function acceptInviteAction(token: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: await say({ code: "SIGN_IN_FIRST" }) };

  const invite = await inspectInvite(token);
  if (!invite.ok) return { ok: false, error: INVITE_ERRORS[invite.reason] };

  // Already inside: joining again would quietly eat a seat for nothing.
  const teams = await listMemberships(user.id);
  if (teams.some((team) => team.id === invite.teamId)) {
    await setTeamCookie(invite.teamSlug);
    revalidatePath("/");
    return { ok: true };
  }

  const spent = await consumeInvite(token);
  if (!spent.ok) return { ok: false, error: INVITE_ERRORS[spent.reason] };

  await joinTeam(user.id, invite.teamId);
  await setTeamCookie(invite.teamSlug);
  revalidatePath("/");
  return { ok: true };
}

/**
 * The team switcher. Only teams the viewer is actually in are accepted —
 * except for the instance operator, who may point at any archive on the box.
 */
export async function switchTeamAction(slug: string): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };

  const mine = viewer.teams.some((team) => team.slug === slug);
  if (!mine && !viewer.user.isAdmin) return { ok: false };

  await setTeamCookie(slug);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The language the interface speaks. Remembered per browser, not per account. */
export async function setLocaleAction(locale: string): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export type AdminState = { error?: string; ok?: string; token?: string };

/**
 * Any member may hand out a link. In a team this size the people who bring
 * someone in are not the people who run the archive, and making them ask an
 * owner first would just mean invites stop happening.
 */
export async function createInviteAction(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const viewer = await requireViewer("/invite");
  const maxUsesRaw = String(formData.get("maxUses") ?? "").trim();
  const expiresRaw = String(formData.get("expiresInDays") ?? "").trim();

  const token = await createInvite({
    teamId: viewer.team.id,
    createdById: viewer.user.id,
    note: String(formData.get("note") ?? ""),
    maxUses: maxUsesRaw ? Number(maxUsesRaw) : null,
    expiresInDays: expiresRaw ? Number(expiresRaw) : null,
  });
  revalidatePath("/admin");
  revalidatePath("/invite");
  return { ok: await say({ code: "INVITE_CREATED" }), token };
}

/** Members pull back their own links; owners and admins pull back any. */
export async function revokeInviteAction(token: string): Promise<{ ok: boolean }> {
  const viewer = await requireViewer("/invite");
  const ok = await revokeInvite(
    token,
    viewer.team.id,
    canModerate(viewer) ? undefined : viewer.user.id,
  );
  revalidatePath("/admin");
  revalidatePath("/invite");
  return { ok };
}

export async function setMemberRoleAction(
  userId: string,
  role: TeamRole,
): Promise<{ ok: boolean; error?: string }> {
  const viewer = await requireTeamAdmin("/admin");
  // Owners are the only ones who can hand out or take back ownership.
  if (viewer.team.role !== "OWNER" && !viewer.user.isAdmin) {
    return { ok: false, error: await say({ code: "OWNER_ONLY_ROLES" }) };
  }
  const result = await setMemberRole(viewer.team.id, userId, role);
  revalidatePath("/admin");
  return result.ok ? { ok: true } : { ok: false, error: await say(result) };
}

export async function removeMemberAction(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const viewer = await requireTeamAdmin("/admin");
  if (viewer.team.role !== "OWNER" && !viewer.user.isAdmin) {
    return { ok: false, error: await say({ code: "OWNER_ONLY_REMOVE" }) };
  }
  if (userId === viewer.user.id) return { ok: false, error: await say({ code: "NOT_YOURSELF" }) };
  const result = await removeMember(viewer.team.id, userId);
  revalidatePath("/admin");
  return result.ok ? { ok: true } : { ok: false, error: await say(result) };
}

export async function renameTeamAction(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const viewer = await requireTeamAdmin("/admin");
  const result = await renameTeam(viewer.team.id, String(formData.get("name") ?? ""));
  revalidatePath("/", "layout");
  return result.ok ? { ok: await say({ code: "RENAMED" }) } : { error: await say(result) };
}

/**
 * Opening a second archive on this box is an operator decision, not a member
 * one: each team costs storage and shows up in every instance-wide count.
 */
export async function createTeamAction(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const viewer = await requireOperator("/admin/instance");
  const result = await createTeam(String(formData.get("name") ?? ""), viewer.user.id);
  if (!result.ok) return { error: await say(result) };
  await setTeamCookie(result.slug);
  redirect("/admin/instance");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
