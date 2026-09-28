import { en } from "./en";
import { ru } from "./ru";
import type { Locale } from "./locale";
import type { Dictionary } from "./en";

export const DICTIONARIES: Record<Locale, Dictionary> = { en, ru };

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export type { Dictionary };
export * from "./locale";
