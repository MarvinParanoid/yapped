/**
 * Which language the archive speaks.
 *
 * Pure module: no imports, so the same rules apply on the server, in a client
 * component and in a test.
 */

export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "yapped_locale";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best guess from the browser, used only until someone picks for themselves.
 *
 * Deliberately crude: it looks for a Russian tag anywhere in the header rather
 * than implementing quality-value negotiation. This archive has two languages
 * and its readers are bilingual — the cost of guessing wrong is one click.
 */
export function localeFromHeader(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  for (const part of acceptLanguage.toLowerCase().split(",")) {
    const tag = part.split(";")[0]!.trim();
    if (tag === "ru" || tag.startsWith("ru-")) return "ru";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return DEFAULT_LOCALE;
}

/**
 * Substitutes `{name}` placeholders.
 *
 * Dictionary entries stay plain strings rather than functions so the whole
 * dictionary can be handed to a client component as data. An unknown
 * placeholder is left as written, which makes a missing value visible in the
 * interface instead of printing "undefined".
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/**
 * Russian needs three forms where English needs two: 1 цитата, 2 цитаты,
 * 5 цитат. Kept here beside `fill` because a count and its noun are always
 * decided together.
 */
export function plural(locale: Locale, n: number, forms: [string, string, string]): string {
  if (locale !== "ru") return n === 1 ? forms[0] : forms[1];
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
