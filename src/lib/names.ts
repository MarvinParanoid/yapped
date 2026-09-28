/**
 * What counts as a name here — for a person, a team, anything a human types
 * that the archive will then print in large type next to a quote.
 *
 * It exists because nothing checked. The quote itself has been capped at 400
 * characters since the first day, but a display name could be any length at
 * all: registration, "add new yapper" on the submit form and team creation all
 * passed whatever arrived straight into the database. A reader found that in
 * ten minutes of using the thing.
 *
 * Pure module: no imports, so it is the same rule on the server, in a form and
 * in a test.
 */

export const NAME_MIN = 2;
/**
 * Long enough for "Кандидат мемологических наук", short enough that a name
 * cannot break a card it is rendered into. The longest real name in the demo
 * archive is 28 characters.
 */
export const NAME_MAX = 40;

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/**
 * Collapses runs of whitespace as well as trimming: a name pasted out of a chat
 * client often arrives with a line break in the middle, and "Diana\n" must not
 * become a different person from "Diana".
 */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/gu, " ").trim();
}

export function validateName(raw: string, subject = "A name"): NameCheck {
  const name = normalizeName(raw);

  if (name.length < NAME_MIN) {
    return { ok: false, error: `${subject} needs at least ${NAME_MIN} characters.` };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, error: `${subject} is limited to ${NAME_MAX} characters.` };
  }
  // A name made only of punctuation sorts strangely and reads as a glitch.
  if (!/\p{L}|\p{N}/u.test(name)) {
    return { ok: false, error: `${subject} needs at least one letter or digit.` };
  }
  return { ok: true, name };
}
