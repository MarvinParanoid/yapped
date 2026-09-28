/**
 * AURA — the only scoring authority in the building.
 *
 * Pure module: no imports, no I/O, no framework. Change the numbers here and
 * the entire archive re-ranks. Nothing else needs to know how a number
 * becomes a reputation.
 */

export type ReactionKey = "BASED" | "DEAD" | "REAL" | "CRINGE" | "STONE";

export const REACTION_KEYS: ReactionKey[] = ["BASED", "DEAD", "REAL", "CRINGE", "STONE"];

/** What each reaction is worth. Negative weights are a feature. */
export const REACTION_WEIGHTS: Record<ReactionKey, number> = {
  BASED: 10,
  DEAD: 12,
  REAL: 8,
  CRINGE: -5,
  STONE: 15,
};

export const REACTION_META: Record<
  ReactionKey,
  { emoji: string; label: string; short: string }
> = {
  BASED: { emoji: "🔥", label: "BASED", short: "based" },
  DEAD: { emoji: "💀", label: "I'M DEAD", short: "dead" },
  REAL: { emoji: "😭", label: "REAL", short: "real" },
  CRINGE: { emoji: "🤡", label: "CRINGE", short: "cringe" },
  STONE: { emoji: "🗿", label: "CERTIFIED", short: "certified" },
};

export type ReactionCounts = Record<ReactionKey, number>;

export const EMPTY_COUNTS: ReactionCounts = {
  BASED: 0,
  DEAD: 0,
  REAL: 0,
  CRINGE: 0,
  STONE: 0,
};

/** The formula. Deliberately boring, deliberately in one place. */
export function computeAura(counts: Partial<ReactionCounts>): number {
  let aura = 0;
  for (const key of REACTION_KEYS) {
    aura += (counts[key] ?? 0) * REACTION_WEIGHTS[key];
  }
  return Math.round(aura);
}

/** How much a single reaction moves the needle (used by the "+N AURA" float). */
export function auraDelta(key: ReactionKey, added: boolean): number {
  return added ? REACTION_WEIGHTS[key] : -REACTION_WEIGHTS[key];
}

/**
 * Trending = aura decayed by age. Mirrors the SQL expression used for feed
 * sorting, so the two can be checked against each other.
 */
export const TRENDING_GRAVITY = 1.5;
export const TRENDING_OFFSET_HOURS = 2;

/**
 * Trending has no window at all: the decay below already sinks an old record to
 * the bottom, and a hard cutoff on top of that only ever removed it from the
 * view entirely. This is a low-volume archive whose whole claim is that it does
 * not forget, so its default view does not stop showing the founding records
 * after two months. Ranking, yes; hiding, no.
 */

export function trendingScore(aura: number, ageHours: number): number {
  return aura / Math.pow(Math.max(ageHours, 0) + TRENDING_OFFSET_HOURS, TRENDING_GRAVITY);
}

/**
 * Certification is NOT an aura threshold — it is earned from witnesses, in
 * lib/verification.ts. Aura only measures how hard the office reacted.
 */

/** Display helper: +847 / -12 / 0 */
export function formatAura(aura: number): string {
  const n = Math.abs(aura).toLocaleString("en-US");
  if (aura > 0) return `+${n}`;
  if (aura < 0) return `-${n}`;
  return "0";
}
