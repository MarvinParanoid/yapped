/**
 * The department's two standing judgements, as pure functions.
 *
 * Both answer the same shape of question — given numbers the archive actually
 * has, which of a fixed set of official phrasings applies — and neither of them
 * knows what those phrasings are. The wording lives in `lib/i18n`, in two
 * independently written registers; this file only decides which key.
 *
 * Deterministic on purpose. A verdict that reads differently on a refresh is
 * not a verdict, and a department that contradicts its own table has stopped
 * being funny and started being broken.
 */

/** How the current situation is described. Bands, not a scale. */
export type SituationKey = "ONGOING" | "STABILISED" | "SUSPICIOUS" | "NO_MATERIAL" | "LOST_CONTROL";

/** Complete local days since the last incident was registered. */
export function situationFor(quietDays: number): SituationKey {
  if (quietDays <= 0) return "ONGOING";
  if (quietDays <= 2) return "STABILISED";
  if (quietDays <= 6) return "SUSPICIOUS";
  if (quietDays <= 13) return "NO_MATERIAL";
  return "LOST_CONTROL";
}

/** The closing paragraph of a weekly report. */
export type VerdictKey = "FIRST_PERIOD" | "NOTHING_NEW" | "WENT_SILENT" | "DOWN" | "STEADY" | "UP";

/**
 * Chosen from the two numbers the report prints above it, so the conclusion
 * can never disagree with the table it closes.
 *
 * `previous` is null when there is no earlier week on record at all — a first
 * reporting period has nothing to compare against, and saying so is better
 * than comparing against an invented zero.
 */
export function verdictFor(registered: number, previous: number | null): VerdictKey {
  if (previous === null) return "FIRST_PERIOD";
  if (registered === 0) return previous === 0 ? "NOTHING_NEW" : "WENT_SILENT";
  if (registered > previous) return "UP";
  if (registered < previous) return "DOWN";
  return "STEADY";
}

/**
 * Week-on-week movement, with the zero base handled rather than divided by.
 *
 * A week that follows an empty one has no percentage — "infinitely more than
 * nothing" is not a figure — so the caller is told to print the absolute
 * change instead. Direction is reported without a verdict attached: more
 * incidents is not objectively worse, it is just more incidents.
 */
export type Movement = {
  delta: number;
  /** Null when the previous week was empty, or when there was no previous week. */
  percent: number | null;
  direction: "UP" | "DOWN" | "FLAT";
  /** No earlier week on record, so there is nothing to compare against. */
  baseless: boolean;
};

export function movementFor(registered: number, previous: number | null): Movement {
  if (previous === null) {
    return { delta: registered, percent: null, direction: "FLAT", baseless: true };
  }
  const delta = registered - previous;
  return {
    delta,
    percent: previous > 0 ? (delta / previous) * 100 : null,
    direction: delta > 0 ? "UP" : delta < 0 ? "DOWN" : "FLAT",
    baseless: false,
  };
}
