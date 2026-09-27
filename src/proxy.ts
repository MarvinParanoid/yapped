import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The archive is invite-only. This is a **fast path**, not the guarantee: it
 * turns away a request carrying no session cookie at all before any rendering
 * happens, which is most drive-by traffic.
 *
 * It cannot do more. It runs without database access, so it cannot tell a live
 * session from an expired one — a stale cookie sails straight through here. The
 * guarantee is `requireViewer`, called from a **layout** in every segment that
 * has a `loading.tsx` (see src/app/(feed)/layout.tsx for why a page is not
 * enough) and from the page everywhere else.
 *
 * Kept free of shared modules on purpose (see the proxy docs): the cookie name
 * is inlined rather than imported, and tests/unit/proxy.test.ts pins it to the
 * value the session module actually sets.
 */
const SESSION_COOKIE = "yapped_session";

/** Reachable without a session: the door, and the things the door needs. */
const OPEN = ["/login", "/register", "/join", "/api"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (OPEN.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }
  if (request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything but the build output, static assets and the icon — otherwise
  // the redirect would swallow the CSS of the page it redirects to.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
