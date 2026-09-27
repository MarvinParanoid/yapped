/**
 * MOMENTUM — how a record moved over a window.
 *
 * Pure module, like aura.ts and elo.ts: no imports, no I/O. It used to live
 * beside the query that feeds it, which meant importing it pulled in a
 * database connection — a component could not use it and a test could not
 * reach it without a Postgres.
 *
 * A record only ever *gains* aura: reconstructing the past from surviving
 * reactions cannot produce a fall. So there is deliberately no "falling"
 * state, because inventing one would be a lie. What a record can do is go
 * quiet while the rest of the archive moves, and that is DORMANT.
 */
export type MomentumState = "NEW" | "REEMERGING" | "RISING" | "STEADY" | "DORMANT";

export const MOMENTUM_META: Record<MomentumState, { label: string; mark: string }> = {
  NEW: { label: "New", mark: "•" },
  REEMERGING: { label: "Re-emerging", mark: "↗" },
  RISING: { label: "Rising", mark: "▲" },
  STEADY: { label: "Steady", mark: "–" },
  DORMANT: { label: "Dormant", mark: "▾" },
};

/** A record counts as woken up only if it was quiet for this long first. */
export const REEMERGING_AGE_DAYS = 45;
export const RISING_PERCENT = 5;
export const REEMERGING_PERCENT = 15;
/** "New" is news for a day, however wide the window is. */
export const NEW_HOURS = 24;

export type MomentumInput = {
  now: number;
  then: number;
  ageDays: number;
  filedInLastDay: boolean;
};

export function classifyMomentum(input: MomentumInput): {
  delta: number;
  percent: number | null;
  state: MomentumState;
} {
  const delta = input.now - input.then;
  const percent = input.then > 0 ? (delta / Math.abs(input.then)) * 100 : null;

  let state: MomentumState;
  if (input.filedInLastDay) state = "NEW";
  else if (delta === 0) state = "DORMANT";
  // Filed inside the window but no longer "new": it earned everything it has
  // during the window, which is the strongest kind of rising there is.
  else if (input.then === 0) state = "RISING";
  else if (input.ageDays >= REEMERGING_AGE_DAYS && (percent ?? 0) >= REEMERGING_PERCENT) {
    state = "REEMERGING";
  } else if ((percent ?? 0) >= RISING_PERCENT) state = "RISING";
  else state = "STEADY";

  return { delta, percent, state };
}
