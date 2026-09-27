/**
 * A yapper's standing title. One per person, first match wins, ordered from
 * most specific to most forgiving — so the title says something rather than
 * everyone ending up "chronic yapper".
 *
 * Pure module: adding a title is one entry with a predicate.
 */
export type TitleStats = {
  yapCount: number;
  totalAura: number;
  certifiedCount: number;
  disputedCount: number;
  witnessedCount: number;
  battleWins: number;
  loreCount: number;
  topTagCount: number;
};

export type Title = {
  key: string;
  label: string;
  blurb: string;
  earned: (stats: TitleStats) => boolean;
};

export const TITLES: Title[] = [
  {
    key: "CERTIFIED_YAP_MACHINE",
    label: "Certified yap machine",
    blurb: "Five or more statements the archive had to certify.",
    earned: (s) => s.certifiedCount >= 5,
  },
  {
    key: "MEETING_MENACE",
    label: "Meeting menace",
    blurb: "Twenty entries on the record, most of them from rooms with an agenda.",
    earned: (s) => s.yapCount >= 20,
  },
  {
    key: "BATTLE_TESTED",
    label: "Battle tested",
    blurb: "Fifteen head-to-head wins.",
    earned: (s) => s.battleWins >= 15,
  },
  {
    key: "AURA_FARMER",
    label: "Aura farmer",
    blurb: "Over three thousand aura accumulated.",
    earned: (s) => s.totalAura >= 3000,
  },
  {
    key: "PERSON_OF_INTEREST",
    label: "Person of interest",
    blurb: "More than one record about them is contested.",
    earned: (s) => s.disputedCount >= 2,
  },
  {
    key: "UNCORROBORATED",
    label: "Uncorroborated",
    blurb: "On the record repeatedly, and nobody will admit to being there.",
    earned: (s) => s.yapCount >= 3 && s.witnessedCount === 0,
  },
  {
    key: "LORE_CONTRIBUTOR",
    label: "Lore contributor",
    blurb: "Keeps the context that makes old statements make sense.",
    earned: (s) => s.loreCount >= 3,
  },
  {
    key: "CERTIFIED_YAPPER",
    label: "Certified yapper",
    blurb: "At least one statement corroborated by three witnesses.",
    earned: (s) => s.certifiedCount >= 1,
  },
  {
    key: "CHRONIC_YAPPER",
    label: "Chronic yapper",
    blurb: "Ten entries and counting.",
    earned: (s) => s.yapCount >= 10,
  },
  {
    key: "OUT_OF_CONTEXT_PROFESSIONAL",
    label: "Out of context professional",
    blurb: "On the record. Context pending.",
    earned: () => true,
  },
];

export function titleFor(stats: TitleStats): Title {
  return TITLES.find((title) => title.earned(stats)) ?? TITLES[TITLES.length - 1];
}
