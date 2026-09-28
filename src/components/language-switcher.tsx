"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions";
import { useLocale } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/locale";
import { cn } from "@/lib/cn";

/**
 * Two languages, so this is a pair of buttons rather than a menu — the whole
 * point is that switching costs one click when the morning is not going well.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const active = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn("flex shrink-0 items-center", className)}>
      {LOCALES.map((locale, index) => (
        <span key={locale} className="flex items-center">
          {index > 0 ? <span className="label px-1 opacity-40">/</span> : null}
          <button
            type="button"
            disabled={pending}
            aria-current={locale === active}
            title={LOCALE_NAMES[locale]}
            className={cn("label hover:text-ink", locale === active && "font-bold text-ink")}
            onClick={() =>
              startTransition(async () => {
                if (locale === active) return;
                await setLocaleAction(locale);
                router.refresh();
              })
            }
          >
            {locale.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}
