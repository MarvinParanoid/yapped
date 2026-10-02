/**
 * The badge catalog. Adding an achievement is one entry in this array plus a
 * predicate over YapperStats — no migration, no UI change.
 */
export type YapperStats = {
  yapCount: number;
  totalAura: number;
  certifiedCount: number;
  bestYapAura: number;
  battleWins: number;
  hasLore: boolean;
  oldestYapAgeDays: number;
};

export type Achievement = {
  key: string;
  label: string;
  blurb: string;
  earned: (stats: YapperStats) => boolean;
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    key: "CERTIFIED_YAP",
    label: "CERTIFIED YAP",
    blurb: "Authored a statement the archive had to certify.",
    earned: (s) => s.certifiedCount >= 1,
  },
  {
    key: "BRAINROT",
    label: "BRAINROT",
    blurb: "Twenty entries on the record. Unprompted.",
    earned: (s) => s.yapCount >= 20,
  },
  {
    key: "HALL_OF_YAP",
    label: "HALL OF YAP",
    blurb: "Won ten head-to-head battles.",
    earned: (s) => s.battleWins >= 10,
  },
  {
    key: "AURA_1000",
    label: "1000 AURA",
    blurb: "Accumulated four figures of aura.",
    earned: (s) => s.totalAura >= 1000,
  },
  {
    key: "VIRAL",
    label: "VIRAL",
    blurb: "A single yap cleared 500 aura on its own.",
    earned: (s) => s.bestYapAura >= 500,
  },
  {
    key: "ANCIENT_LORE",
    label: "ANCIENT LORE",
    blurb: "Has a documented yap older than six months.",
    earned: (s) => s.hasLore && s.oldestYapAgeDays >= 180,
  },
];

export function evaluateAchievements(stats: YapperStats): Achievement[] {
  return ACHIEVEMENTS.filter((achievement) => achievement.earned(stats));
}
