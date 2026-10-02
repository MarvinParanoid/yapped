/**
 * Reading an instant in the archive's own clock.
 *
 * Every timestamp is stored as an instant, and the interface used to read them
 * back with `getUTCHours()` and friends. For an archive kept by people three
 * hours east of UTC that meant its "most dangerous hour" was named three hours
 * early, and anything said between midnight and 03:00 was filed under the
 * previous day — quietly, because a date with no zone printed on it looks
 * correct whatever it says.
 *
 * The trick here is deliberate and worth stating: `shift` returns a Date whose
 * **UTC** parts are the wall-clock parts in the target zone. It is not the same
 * instant any more and must never be stored or compared against a real one —
 * it exists to be taken apart by `getUTCFullYear()` and the rest, which is how
 * the rest of the codebase already reads dates.
 *
 * Pure: Intl is part of the language, so this imports nothing.
 */

/** Minutes the zone is ahead of UTC at that instant, DST included. */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const at = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  // "24" is how some locales render midnight; Date.UTC treats it as the next
  // day, which is exactly right.
  const asUtc = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour"), at("minute"), at("second"));
  // Seconds are compared, so round to the minute the zone actually uses.
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/**
 * The same wall clock, relabelled as UTC, so `getUTC*` reads local parts.
 * Never store or compare the result as a moment in time.
 */
export function shift(instant: Date, timeZone: string): Date {
  return new Date(instant.getTime() + offsetMinutes(instant, timeZone) * 60000);
}

/** An IANA zone the runtime actually knows; anything else falls back to UTC. */
export function knownZone(candidate: string | null | undefined): string {
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}
