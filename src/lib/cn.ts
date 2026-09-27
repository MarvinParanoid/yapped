/** Tiny class joiner — no runtime dependency for something this small. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
