import type { Metadata, Viewport } from "next";
import { Golos_Text, JetBrains_Mono } from "next/font/google";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { getViewer } from "@/lib/auth/team";
import { LocaleProvider } from "@/lib/i18n/client";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

/** Both families carry Cyrillic — the archive is bilingual by design. */
const golos = Golos_Text({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-golos",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "yapped.",
    template: "%s — yapped.",
  },
  description: "things that should've stayed in the meeting",
  openGraph: {
    title: "yapped.",
    description: "things that should've stayed in the meeting",
    siteName: "yapped.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0C0C0C",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The tab bar is navigation into the archive; an outsider gets neither it nor
  // the padding it reserves.
  const viewer = await getViewer();
  const [locale, dictionary] = await Promise.all([getLocale(), getDictionary()]);

  return (
    <html lang={locale} className={`${golos.variable} ${jetbrains.variable}`}>
      <body className={`flex min-h-dvh flex-col ${viewer ? "pb-[52px] md:pb-0" : ""}`}>
        <LocaleProvider locale={locale} dictionary={dictionary}>
          <SiteHeader />
          {/* A block, not a flex container: `mx-auto max-w-…` on a flex item
              shrinks to its content instead of centring a full-width box —
              which only shows up on pages with little content, like an empty
              archive. */}
          <main className="flex-1">{children}</main>
          <SiteFooter />
          {viewer ? <MobileTabBar /> : null}
        </LocaleProvider>
      </body>
    </html>
  );
}
