/**
 * Where a sign-in is allowed to land.
 *
 * The login form carries the page the visitor was trying to reach, and it
 * arrives as a form field — which means it arrives from whoever wrote the link.
 * Left alone, `?next=https://elsewhere.example` turns this archive's own login
 * page into a redirector: the address bar says yapped, the password is typed
 * here, and the next screen is someone else's.
 *
 * So the rule is allow-list, not deny-list: one leading slash, nothing that a
 * browser could read as an authority, and no protocol of any kind. Anything
 * else is not corrected — it is dropped for the front page.
 */
export function returnTo(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const next = raw.trim();

  if (!next.startsWith("/")) return "/";
  // "//host" and "/\host" are both protocol-relative: the browser leaves.
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  // A backslash is not a path separator here but is one to some parsers, and
  // control characters are how a scheme gets smuggled past a startsWith check.
  if (/[\\]/.test(next)) return "/";
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";

  return next;
}
