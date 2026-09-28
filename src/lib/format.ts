/** Formatting used across the archive. Server-rendered, so deterministic. */

/** 420 → "#00420" */
export function yapCode(id: number): string {
  return `#${String(id).padStart(5, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 24 Sep 2026 */
/**
 * `24 Sep 2026` — or `24 СЕН 2026`, given month names from the dictionary.
 *
 * The names arrive as an argument rather than being read here: this module is
 * pure, and a formatter that reaches for a request's locale stops being
 * testable without one.
 */
export function formatDate(date: Date, months: readonly string[] = MONTHS): string {
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** 24.09.2026 — the archival stamp */
export function formatStamp(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** Unicode-safe: слово-тоже-слаг */
export function slugifyTag(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export type QuoteScale = "detail" | "feature" | "feed" | "compact" | "battle";

/** The quote gets smaller as it gets longer, never smaller than readable. */
export function quoteSizeClass(text: string, scale: QuoteScale = "feed"): string {
  const length = text.length;
  if (scale === "detail") {
    if (length > 160) return "text-[clamp(1.5rem,3.2vw,2.4rem)]";
    if (length > 90) return "text-[clamp(1.9rem,4.4vw,3.4rem)]";
    if (length > 45) return "text-[clamp(2.2rem,5.6vw,4.4rem)]";
    return "text-[clamp(2.5rem,7vw,5.5rem)]";
  }
  if (scale === "feature") {
    if (length > 160) return "text-[clamp(1.5rem,2.9vw,1.95rem)]";
    if (length > 90) return "text-[clamp(1.7rem,3.5vw,2.5rem)]";
    if (length > 45) return "text-[clamp(1.9rem,4.3vw,3.1rem)]";
    return "text-[clamp(2.1rem,5.1vw,3.7rem)]";
  }
  if (scale === "compact") {
    if (length > 160) return "text-[clamp(1rem,1.8vw,1.2rem)]";
    if (length > 90) return "text-[clamp(1.1rem,2.1vw,1.4rem)]";
    if (length > 45) return "text-[clamp(1.2rem,2.5vw,1.6rem)]";
    return "text-[clamp(1.3rem,2.9vw,1.85rem)]";
  }
  if (scale === "battle") {
    if (length > 120) return "text-[clamp(1.1rem,2.2vw,1.5rem)]";
    if (length > 60) return "text-[clamp(1.3rem,2.6vw,1.9rem)]";
    return "text-[clamp(1.5rem,3vw,2.3rem)]";
  }
  if (length > 160) return "text-[clamp(1.25rem,2.4vw,1.6rem)]";
  if (length > 90) return "text-[clamp(1.45rem,3vw,2.1rem)]";
  if (length > 45) return "text-[clamp(1.6rem,3.6vw,2.6rem)]";
  return "text-[clamp(1.75rem,4.2vw,3rem)]";
}
