import type { ReactionCounts, ReactionKey } from "@/lib/ranking/aura";
import type { Verification } from "@/lib/verification";

export type YapStatus = "ARCHIVED" | "REDACTED";
export type WitnessStance = "PRESENT" | "DENIED";
export type Classification = "ROUTINE" | "QUESTIONABLE" | "UNHINGED" | "CLASSIFIED";

export type YapperRef = {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  title: string | null;
  /** Quoted here, but has never registered — see the claim flow on /register. */
  hasAccount: boolean;
};

export type EvidenceView = {
  id: string;
  url: string;
  caption: string | null;
  position: number;
  width: number | null;
  height: number | null;
};

export type TagView = { slug: string; label: string };

/** The DTO every component speaks. Prisma types never leave the service layer. */
export type YapView = {
  id: number;
  code: string;
  text: string;
  lore: string | null;
  saidAt: Date;
  createdAt: Date;
  status: YapStatus;
  classification: Classification;
  verification: Verification;
  witnessCount: number;
  denialCount: number;
  acknowledgedAt: Date | null;
  disputedAt: Date | null;
  disputeStatement: string | null;
  aura: number;
  reactionCount: number;
  viewCount: number;
  eloRating: number;
  battleWins: number;
  battleLosses: number;
  author: YapperRef;
  submittedBy: YapperRef | null;
  tags: TagView[];
  evidence: EvidenceView[];
  counts: ReactionCounts;
  viewerReactions: ReactionKey[];
  /** Where the viewer stands on whether this happened at all. */
  viewerStance: WitnessStance | null;
};

export type ArchiveStats = {
  yapCount: number;
  totalAura: number;
  certifiedYappers: number;
};

export type SortKey = "trending" | "fresh" | "top";
export type RangeKey = "today" | "week" | "month" | "all";

/** Ranked for what someone brought in, rather than what they said. */
export type ArchivistEntry = {
  yapper: YapperRef;
  filedCount: number;
  /** Aura on the records they filed — how good the find was, not how many. */
  discoveredAura: number;
  testimonyCount: number;
  battleVotes: number;
  rank: number;
};

export type LeaderboardEntry = {
  yapper: YapperRef;
  yapCount: number;
  totalAura: number;
  reactionsReceived: number;
  certifiedCount: number;
  bestYap: { id: number; code: string; text: string; aura: number } | null;
  rank: number;
};
