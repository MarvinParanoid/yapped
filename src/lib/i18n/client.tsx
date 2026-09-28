"use client";

import { createContext, useContext } from "react";
import { en } from "./en";
import type { Dictionary } from "./en";
import type { Locale } from "./locale";

/**
 * The dictionary reaches client components as plain data through one provider
 * in the root layout — a few kilobytes of strings, and no request for them.
 *
 * English is the fallback so a component rendered outside the provider (a test,
 * a stray portal) shows words rather than throwing.
 */
const LocaleContext = createContext<{ locale: Locale; d: Dictionary }>({
  locale: "en",
  d: en,
});

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={{ locale, d: dictionary }}>{children}</LocaleContext.Provider>
  );
}

/** The dictionary, in a client component. */
export function useD(): Dictionary {
  return useContext(LocaleContext).d;
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}
