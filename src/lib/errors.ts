/**
 * Every refusal the archive can hand back to a person, as a code.
 *
 * Services and actions return one of these instead of a sentence, because a
 * service has no idea which language the interface is speaking — and because a
 * message written in twelve places drifts in eleven of them.
 *
 * `src/lib/i18n/en.ts` is checked against this union at compile time, so adding
 * a code without wording it is a build failure rather than a blank message.
 */
export type ErrorCode =
  | "AUTH_REQUIRED"
  | "SIGN_IN_FIRST"
  | "TEXT_TOO_SHORT"
  | "TEXT_TOO_LONG"
  | "AUTHOR_MISSING"
  | "DATE_INVALID"
  | "DATE_FUTURE"
  | "REFUSED"
  | "EVIDENCE_TYPE"
  | "EVIDENCE_SIZE"
  | "USERNAME_FORMAT"
  | "USERNAME_TAKEN"
  | "PASSWORD_SHORT"
  | "CREDENTIALS"
  | "NAME_SHORT"
  | "NAME_LONG"
  | "NAME_UNREADABLE"
  | "NOT_A_MEMBER"
  | "NEEDS_AN_OWNER"
  | "LAST_OWNER"
  | "OWNER_ONLY_ROLES"
  | "OWNER_ONLY_REMOVE"
  | "NOT_YOURSELF"
  | "PICK_ANOTHER_NAME"
  | "INVITE_USES_INVALID"
  | "INVITE_DAYS_INVALID"
  | "INVITE_CREATED"
  | "RENAMED";

/** A refusal, plus whatever numbers its wording needs. */
export type Failure = { code: ErrorCode; vars?: Record<string, string | number> };
