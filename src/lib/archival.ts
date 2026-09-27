import type { YapView } from "@/lib/types";
import { isContested } from "@/lib/verification";

/**
 * Cards are not all the same weight. Emphasis is derived from the data — the
 * loudest records in a page get a heavier composition, the quiet ones collapse
 * into a ledger row — so the feed has rhythm instead of looking like a table.
 *
 * Percentiles are computed over the page being rendered rather than against
 * fixed aura thresholds, so the rhythm survives any dataset.
 */
export type Emphasis = "feature" | "standard" | "compact";

export function assignEmphasis(yaps: YapView[]): Map<number, Emphasis> {
  const result = new Map<number, Emphasis>();
  if (yaps.length === 0) return result;

  const auras = yaps.map((yap) => yap.aura).sort((a, b) => a - b);
  const at = (p: number) => auras[Math.min(auras.length - 1, Math.floor(auras.length * p))];
  const featureFloor = at(0.9);
  const compactCeiling = at(0.35);

  let featured = 0;
  for (const yap of yaps) {
    const loud = yap.aura >= featureFloor && yap.verification === "CERTIFIED";
    // At most two feature cards per page, or the emphasis stops meaning anything.
    if (loud && featured < 2) {
      result.set(yap.id, "feature");
      featured += 1;
      continue;
    }
    const quiet =
      yap.aura <= compactCeiling &&
      !yap.lore &&
      yap.evidence.length === 0 &&
      yap.verification === "UNVERIFIED";
    result.set(yap.id, quiet ? "compact" : "standard");
  }
  return result;
}

/**
 * At most one archival marker per record, and only when the data earns it.
 * Deliberately rare — roughly one card in eight. Popularity is *not* a marker;
 * the verification badge carries witness counts instead.
 */
export function archivalNote(yap: YapView): string | null {
  // A formal dispute from the person it is about outranks everything.
  if (yap.disputedAt) return "Disputed by yapper";
  // Otherwise: colleagues who deny it ever happened.
  if (isContested(yap.witnessCount, yap.denialCount)) return "Disputed";
  if (yap.evidence.length > 0) return "Evidence attached";
  return null;
}

export function isDisputed(note: string | null): boolean {
  return note?.startsWith("Disputed") ?? false;
}

/** Tag frequency drives type size: the team's vocabulary, ranked by damage. */
export function tagWeight(count: number, max: number): 0 | 1 | 2 | 3 {
  if (max <= 1) return 1;
  const share = count / max;
  if (share >= 0.85) return 3;
  if (share >= 0.55) return 2;
  if (share >= 0.3) return 1;
  return 0;
}
