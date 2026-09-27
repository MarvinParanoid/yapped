/**
 * VERIFICATION — did this actually happen?
 *
 * A separate axis from aura on purpose. Aura is how hard the office reacted;
 * verification is how many colleagues will put their own name behind
 * "I was there". A beloved yap nobody witnessed stays UNVERIFIED, and a dull
 * one six people remember is CERTIFIED.
 *
 * Three independent dimensions, deliberately kept apart:
 *   who said it  →  who filed it  →  who will corroborate it
 *
 * The author is never a witness. Witnessing means *independent* corroboration,
 * so the person who said it cannot supply it; they acknowledge the record or
 * deny it instead, and neither move counts toward certification. Filing your
 * own quote acknowledges it automatically.
 *
 * Pure module: no imports, no I/O. Change the thresholds and the whole archive
 * re-verifies.
 */

export type Verification = "UNVERIFIED" | "WITNESSED" | "CONFIRMED" | "CERTIFIED";

export const VERIFICATION_LADDER: Verification[] = [
  "UNVERIFIED",
  "WITNESSED",
  "CONFIRMED",
  "CERTIFIED",
];

/** Witnesses required to reach each rung. */
export const WITNESS_THRESHOLDS: Record<Verification, number> = {
  UNVERIFIED: 0,
  WITNESSED: 1,
  CONFIRMED: 2,
  CERTIFIED: 3,
};

export const VERIFICATION_META: Record<
  Verification,
  { label: string; blurb: string; rung: number }
> = {
  UNVERIFIED: {
    label: "Unverified",
    blurb: "No one has corroborated this statement yet.",
    rung: 0,
  },
  WITNESSED: {
    label: "Witnessed",
    blurb: "One colleague confirms they were present.",
    rung: 1,
  },
  CONFIRMED: {
    label: "Confirmed",
    blurb: "Two independent witnesses place this statement in the room.",
    rung: 2,
  },
  CERTIFIED: {
    label: "Certified",
    blurb: "Three or more witnesses. The record is considered settled.",
    rung: 3,
  },
};

/** The formula. Denials are recorded but never demote a record — see disputes. */
export function verificationFor(witnesses: number): Verification {
  if (witnesses >= WITNESS_THRESHOLDS.CERTIFIED) return "CERTIFIED";
  if (witnesses >= WITNESS_THRESHOLDS.CONFIRMED) return "CONFIRMED";
  if (witnesses >= WITNESS_THRESHOLDS.WITNESSED) return "WITNESSED";
  return "UNVERIFIED";
}

/** The next rung up, and how many more people it takes to get there. */
export function nextRung(
  witnesses: number,
): { rung: Verification; needed: number } | null {
  const index = VERIFICATION_LADDER.indexOf(verificationFor(witnesses));
  const next = VERIFICATION_LADDER[index + 1];
  if (!next) return null;
  return { rung: next, needed: WITNESS_THRESHOLDS[next] - witnesses };
}

/**
 * A record is disputed when enough people say it never happened. It is never
 * removed — the archive keeps the disagreement.
 */
export const DENIAL_DISPUTE_THRESHOLD = 2;

export function isContested(witnesses: number, denials: number): boolean {
  return denials >= DENIAL_DISPUTE_THRESHOLD && denials * 2 >= witnesses;
}

/** "3 witnesses" / "1 witness" / "no witnesses" */
export function witnessLabel(count: number): string {
  if (count === 0) return "no witnesses";
  return `${count} ${count === 1 ? "witness" : "witnesses"}`;
}
