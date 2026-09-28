import Link from "next/link";
import { canModerate, getViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteFooter() {
  const viewer = await getViewer();
  const d = await getDictionary();

  return (
    <footer className="mt-12 border-t border-ink">
      {/* Deliberately almost empty. Everything that was listed here is reachable
          from the navigation or the sidebar, and the slogan already appears in
          the stats strip — a third copy is noise. */}
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-baseline gap-x-3 gap-y-2 px-4 py-6 sm:px-6 lg:px-8">
        <span className="wordmark text-[18px]">yapped.</span>
        <span className="label">{d.brand.footer}</span>
        {viewer ? (
          <span className="label ml-auto flex items-baseline gap-4">
            <span>{viewer.team.name}</span>
            {/* The header's links are desktop-only; this is how a phone gets there. */}
            <Link href="/invite" className="hover:text-ink lg:hidden">
              {d.nav.invite}
            </Link>
            <LanguageSwitcher className="lg:hidden" />
            {canModerate(viewer) ? (
              <Link href="/admin" className="hover:text-ink lg:hidden">
                {d.nav.admin}
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
    </footer>
  );
}
