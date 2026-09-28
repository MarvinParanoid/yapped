import { cache } from "react";
import { cookies, headers } from "next/headers";
import { dictionaryFor, type Dictionary } from "./index";
import { isLocale, localeFromHeader, LOCALE_COOKIE, type Locale } from "./locale";

/**
 * The language for this request: whatever was chosen, otherwise whatever the
 * browser asked for.
 *
 * Memoized per request — the layout, the header, the footer and the page each
 * need it, and that should be one read rather than four.
 */
export const getLocale = cache(async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const chosen = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return localeFromHeader((await headers()).get("accept-language"));
});

export async function getDictionary(): Promise<Dictionary> {
  return dictionaryFor(await getLocale());
}
