import { requireViewer } from "@/lib/auth/team";

/**
 * The gate has to live in a layout, not the page.
 *
 * `loading.tsx` puts a Suspense boundary around the page, and Next flushes the
 * shell before the page body runs — so a `redirect()` raised inside the page
 * arrives as an RSC payload on a **200**. A layout renders above that boundary,
 * so its redirect is a real 307. Any segment with a loading.tsx needs one of
 * these; tests/unit/route-gates.test.ts enforces that.
 */
export default async function FeedLayout({ children }: { children: React.ReactNode }) {
  await requireViewer("/");
  return children;
}
