import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { yapCode } from "@/lib/format";
import {
  EMPTY_COUNTS,
  computeAura,
  type ReactionCounts,
  type ReactionKey,
} from "@/lib/ranking/aura";
import type { SearchFilter } from "@/lib/search";
import { verificationFor, type Verification } from "@/lib/verification";
import type {
  ArchiveStats,
  Classification,
  RangeKey,
  SortKey,
  WitnessStance,
  YapStatus,
  YapView,
  YapperRef,
} from "@/lib/types";

const yapInclude = {
  author: true,
  submittedBy: true,
  tags: { include: { tag: true } },
  evidence: { orderBy: { position: "asc" } },
} as const;

type YapRow = Awaited<ReturnType<typeof prisma.yap.findFirstOrThrow<{ include: typeof yapInclude }>>>;

function toYapperRef(user: {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  title: string | null;
  username?: string | null;
}): YapperRef {
  return {
    id: user.id,
    displayName: user.displayName,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    title: user.title,
    hasAccount: Boolean(user.username),
  };
}

function toYapView(
  row: YapRow,
  counts: ReactionCounts,
  viewerReactions: ReactionKey[],
  viewerStance: WitnessStance | null,
): YapView {
  return {
    id: row.id,
    code: yapCode(row.id),
    text: row.text,
    lore: row.lore,
    saidAt: row.saidAt,
    createdAt: row.createdAt,
    status: row.status as YapStatus,
    classification: row.classification as Classification,
    verification: row.verification as Verification,
    witnessCount: row.witnessCount,
    denialCount: row.denialCount,
    acknowledgedAt: row.acknowledgedAt,
    disputedAt: row.disputedAt,
    disputeStatement: row.disputeStatement,
    aura: row.aura,
    reactionCount: row.reactionCount,
    viewCount: row.viewCount,
    eloRating: row.eloRating,
    battleWins: row.battleWins,
    battleLosses: row.battleLosses,
    author: toYapperRef(row.author),
    submittedBy: row.submittedBy ? toYapperRef(row.submittedBy) : null,
    tags: row.tags.map((link) => ({ slug: link.tag.slug, label: link.tag.label })),
    evidence: row.evidence.map((item) => ({
      id: item.id,
      url: storage().url(item.storageKey),
      caption: item.caption,
      position: item.position,
      width: item.width,
      height: item.height,
    })),
    counts,
    viewerReactions,
    viewerStance,
  };
}

/**
 * Reaction counts, the viewer's own reactions and the viewer's witness stance
 * for a set of yaps — three queries regardless of how many yaps are listed.
 */
async function loadEngagement(yapIds: number[], viewerId?: string | null) {
  const counts = new Map<number, ReactionCounts>();
  const mine = new Map<number, ReactionKey[]>();
  const stances = new Map<number, WitnessStance>();
  if (yapIds.length === 0) return { counts, mine, stances };

  const grouped = await prisma.reaction.groupBy({
    by: ["yapId", "type"],
    where: { yapId: { in: yapIds } },
    _count: { _all: true },
  });
  for (const row of grouped) {
    const bucket = counts.get(row.yapId) ?? { ...EMPTY_COUNTS };
    bucket[row.type as ReactionKey] = row._count._all;
    counts.set(row.yapId, bucket);
  }

  if (viewerId) {
    const [own, witnessed] = await Promise.all([
      prisma.reaction.findMany({
        where: { yapId: { in: yapIds }, userId: viewerId },
        select: { yapId: true, type: true },
      }),
      prisma.witness.findMany({
        where: { yapId: { in: yapIds }, userId: viewerId },
        select: { yapId: true, stance: true },
      }),
    ]);
    for (const row of own) {
      const list = mine.get(row.yapId) ?? [];
      list.push(row.type as ReactionKey);
      mine.set(row.yapId, list);
    }
    for (const row of witnessed) {
      stances.set(row.yapId, row.stance as WitnessStance);
    }
  }

  return { counts, mine, stances };
}

async function hydrate(rows: YapRow[], viewerId?: string | null): Promise<YapView[]> {
  const { counts, mine, stances } = await loadEngagement(
    rows.map((row) => row.id),
    viewerId,
  );
  return rows.map((row) =>
    toYapView(
      row,
      counts.get(row.id) ?? { ...EMPTY_COUNTS },
      mine.get(row.id) ?? [],
      stances.get(row.id) ?? null,
    ),
  );
}

function rangeFilter(range: RangeKey): Date | null {
  const now = Date.now();
  switch (range) {
    case "today":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "week":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export type ListYapsOptions = {
  /** Required, not optional: a forgotten team filter would leak another
      team's archive, so the type system insists on it. */
  teamId: string;
  sort?: SortKey;
  range?: RangeKey;
  query?: string;
  tag?: string;
  authorId?: string;
  /** Parsed search qualifiers — see lib/search.ts. */
  filter?: SearchFilter;
  take?: number;
  skip?: number;
  viewerId?: string | null;
};

/**
 * The single source of truth for "which records are we looking at". Both the
 * listing and the count go through it, so a filter can never apply to one and
 * not the other.
 */
function buildWhere(options: ListYapsOptions) {
  const { teamId, sort, range = "all", query, tag, authorId, filter } = options;
  // Trending used to cut everything older than sixty days. The decay already
  // sinks an old record to the bottom, so the cut only ever removed it from the
  // view entirely — and Trending is the default view. An archive whose motto is
  // "the internet forgets, we don't" should not quietly stop showing its own
  // founding records after two months. Ranking, yes; hiding, no.
  const since = sort === "trending" ? null : rangeFilter(range);

  // saidAt can be constrained by the window and by before:/after: at once.
  const saidAt: { gte?: Date; lt?: Date } = {};
  if (since) saidAt.gte = since;
  if (filter?.after && (!saidAt.gte || filter.after > saidAt.gte)) saidAt.gte = filter.after;
  if (filter?.before) saidAt.lt = filter.before;

  const text = filter?.text || query;
  const slug = filter?.tag ?? tag;

  const and: Record<string, unknown>[] = [];

  if (filter?.author) {
    and.push({
      author: {
        OR: [
          { displayName: { contains: filter.author, mode: "insensitive" as const } },
          { handle: { equals: filter.author.toLowerCase() } },
        ],
      },
    });
  }
  if (filter?.submitter) {
    and.push({
      submittedBy: {
        OR: [
          { displayName: { contains: filter.submitter, mode: "insensitive" as const } },
          { handle: { equals: filter.submitter.toLowerCase() } },
        ],
      },
    });
  }
  if (filter?.aura) {
    const { op, value } = filter.aura;
    const clause =
      op === ">"
        ? { gt: value }
        : op === ">="
          ? { gte: value }
          : op === "<"
            ? { lt: value }
            : op === "<="
              ? { lte: value }
              : { equals: value };
    and.push({ aura: clause });
  }
  if (filter?.verification) and.push({ verification: filter.verification });

  for (const has of filter?.has ?? []) {
    if (has === "evidence") and.push({ evidence: { some: {} } });
    if (has === "lore") and.push({ lore: { not: null } });
    if (has === "witnesses") and.push({ witnessCount: { gt: 0 } });
    // Disputed covers both a formal dispute and enough people denying it.
    if (has === "dispute") {
      and.push({ OR: [{ disputedAt: { not: null } }, { denialCount: { gte: 2 } }] });
    }
  }

  return {
    teamId,
    deletedAt: null,
    ...(authorId ? { authorId } : {}),
    ...(Object.keys(saidAt).length > 0 ? { saidAt } : {}),
    ...(text ? { text: { contains: text, mode: "insensitive" as const } } : {}),
    ...(slug ? { tags: { some: { tag: { slug } } } } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

export async function listYaps(options: ListYapsOptions): Promise<YapView[]> {
  const { sort = "trending", take = 20, skip = 0, viewerId } = options;
  const where = buildWhere(options);

  // Trending needs the decay expression, which only SQL can order by.
  if (sort === "trending") {
    const candidates = await prisma.yap.findMany({
      where,
      select: { id: true, aura: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const now = Date.now();
    const ranked = candidates
      .map((row) => ({
        id: row.id,
        score:
          row.aura /
          Math.pow((now - row.createdAt.getTime()) / 3_600_000 + 2, 1.5),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(skip, skip + take)
      .map((row) => row.id);

    if (ranked.length === 0) return [];
    const rows = await prisma.yap.findMany({
      where: { id: { in: ranked } },
      include: yapInclude,
    });
    const order = new Map(ranked.map((id, index) => [id, index]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return hydrate(rows, viewerId);
  }

  const orderBy =
    sort === "top"
      ? ([{ aura: "desc" }, { createdAt: "desc" }] as const)
      : ([{ createdAt: "desc" }] as const);

  const rows = await prisma.yap.findMany({
    where,
    include: yapInclude,
    orderBy: [...orderBy],
    take,
    skip,
  });
  return hydrate(rows, viewerId);
}

export async function countYaps(options: ListYapsOptions): Promise<number> {
  return prisma.yap.count({ where: buildWhere(options) });
}

/**
 * Several records at once, hydrated in one pass.
 *
 * `getYap` in a loop was three queries per record; "On this day" could show a
 * dozen anniversaries and did exactly that.
 */
export async function getYaps(
  ids: number[],
  teamId: string,
  viewerId?: string | null,
): Promise<YapView[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.yap.findMany({
    where: { id: { in: ids }, teamId, deletedAt: null },
    include: yapInclude,
  });
  const views = await hydrate(rows, viewerId);
  // The caller chose the order; preserve it rather than whatever the database
  // felt like returning.
  const byId = new Map(views.map((view) => [view.id, view]));
  return ids.map((id) => byId.get(id)).filter((view): view is YapView => view !== undefined);
}

export async function getYap(
  id: number,
  teamId: string,
  viewerId?: string | null,
): Promise<YapView | null> {
  const row = await prisma.yap.findFirst({
    where: { id, teamId, deletedAt: null },
    include: yapInclude,
  });
  if (!row) return null;
  const [view] = await hydrate([row], viewerId);
  return view ?? null;
}

/** Just enough for <title> and OG tags — metadata must not pay for the page. */
export async function getYapSummary(
  id: number,
  teamId: string,
): Promise<{ text: string; lore: string | null; author: string } | null> {
  const row = await prisma.yap.findFirst({
    where: { id, teamId, deletedAt: null },
    select: { text: true, lore: true, author: { select: { displayName: true } } },
  });
  return row ? { text: row.text, lore: row.lore, author: row.author.displayName } : null;
}

export async function recordView(id: number, teamId: string): Promise<void> {
  // The team is not load-bearing today — the only caller has already resolved
  // the record inside its own archive. It is required anyway, because every
  // other write in this file takes it, and the one that does not is the one
  // that quietly stops being checked when a second caller appears.
  await prisma.yap
    .updateMany({ where: { id, teamId }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);
}

export async function getRelatedYaps(
  teamId: string,
  authorId: string,
  excludeId: number,
  take = 3,
  viewerId?: string | null,
): Promise<YapView[]> {
  const rows = await prisma.yap.findMany({
    where: { teamId, authorId, deletedAt: null, id: { not: excludeId } },
    include: yapInclude,
    orderBy: { aura: "desc" },
    take,
  });
  return hydrate(rows, viewerId);
}

export async function getRandomYap(
  teamId: string,
  viewerId?: string | null,
  excludeId?: number,
): Promise<YapView | null> {
  const total = await prisma.yap.count({
    where: { teamId, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (total === 0) return null;
  const row = await prisma.yap.findFirst({
    where: { teamId, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    include: yapInclude,
    skip: Math.floor(Math.random() * total),
  });
  if (!row) return null;
  const [view] = await hydrate([row], viewerId);
  return view ?? null;
}

/**
 * Recompute and persist the cached aura for one yap. The formula itself lives
 * in lib/ranking/aura.ts — this only moves numbers around.
 */
export async function refreshAura(yapId: number): Promise<{ aura: number; counts: ReactionCounts }> {
  const grouped = await prisma.reaction.groupBy({
    by: ["type"],
    where: { yapId },
    _count: { _all: true },
  });
  const counts: ReactionCounts = { ...EMPTY_COUNTS };
  let reactionCount = 0;
  for (const row of grouped) {
    counts[row.type as ReactionKey] = row._count._all;
    reactionCount += row._count._all;
  }
  const aura = computeAura(counts);

  await prisma.yap.update({
    where: { id: yapId },
    data: { aura, reactionCount },
  });
  return { aura, counts };
}

export type ToggleResult = {
  added: boolean;
  aura: number;
  counts: ReactionCounts;
  viewerReactions: ReactionKey[];
};

/** One reaction per user per yap per type. Clicking again takes it back. */
export async function toggleReaction(
  yapId: number,
  teamId: string,
  userId: string,
  type: ReactionKey,
): Promise<ToggleResult> {
  const owned = await prisma.yap.findFirst({
    where: { id: yapId, teamId },
    select: { id: true, authorId: true },
  });
  if (!owned) throw new Error("NOT_FOUND");

  // Aura measures how hard the room reacted, and the author is not the room.
  // The archive already refused to let them witness their own statement; being
  // able to add to its score anyway was the same rule enforced in one place and
  // not the other. Their channel is I SAID THAT, which moves no numbers.
  if (owned.authorId === userId) throw new Error("AUTHOR_CANNOT_REACT");

  const existing = await prisma.reaction.findUnique({
    where: { yapId_userId_type: { yapId, userId, type } },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({ data: { yapId, userId, type } });
  }

  const { aura, counts } = await refreshAura(yapId);
  const mine = await prisma.reaction.findMany({
    where: { yapId, userId },
    select: { type: true },
  });

  return {
    added: !existing,
    aura,
    counts,
    viewerReactions: mine.map((row) => row.type as ReactionKey),
  };
}

export type WitnessState = {
  stance: WitnessStance | null;
  witnessCount: number;
  denialCount: number;
  verification: Verification;
};

/** Recompute and persist the cached witness tallies for one record. */
export async function refreshVerification(yapId: number): Promise<WitnessState> {
  const grouped = await prisma.witness.groupBy({
    by: ["stance"],
    where: { yapId },
    _count: { _all: true },
  });

  let witnessCount = 0;
  let denialCount = 0;
  for (const row of grouped) {
    if (row.stance === "PRESENT") witnessCount = row._count._all;
    else denialCount = row._count._all;
  }

  const verification = verificationFor(witnessCount);
  await prisma.yap.update({
    where: { id: yapId },
    data: { witnessCount, denialCount, verification },
  });

  return { stance: null, witnessCount, denialCount, verification };
}

/**
 * "I was there" / "cap". One position per person per record; pressing the same
 * button again withdraws it. Denials never remove a record — the archive keeps
 * the disagreement.
 */
export async function setWitnessStance(
  yapId: number,
  teamId: string,
  userId: string,
  stance: WitnessStance,
): Promise<WitnessState> {
  // A witness is independent corroboration. The person who said it cannot
  // corroborate themselves — they acknowledge or dispute instead.
  const yap = await prisma.yap.findFirst({
    where: { id: yapId, teamId },
    select: { authorId: true },
  });
  if (!yap) throw new Error("NOT_FOUND");
  if (yap.authorId === userId) throw new Error("AUTHOR_CANNOT_WITNESS");

  const existing = await prisma.witness.findUnique({
    where: { yapId_userId: { yapId, userId } },
  });

  let next: WitnessStance | null = stance;
  if (!existing) {
    await prisma.witness.create({ data: { yapId, userId, stance } });
  } else if (existing.stance === stance) {
    await prisma.witness.delete({ where: { id: existing.id } });
    next = null;
  } else {
    await prisma.witness.update({ where: { id: existing.id }, data: { stance } });
  }

  const state = await refreshVerification(yapId);
  return { ...state, stance: next };
}

/** Who went on the record about this statement. */
export async function listWitnesses(
  yapId: number,
  teamId: string,
): Promise<Array<{ user: YapperRef; stance: WitnessStance; at: Date }>> {
  const rows = await prisma.witness.findMany({
    where: { yapId, yap: { teamId } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    user: toYapperRef(row.user),
    stance: row.stance as WitnessStance,
    at: row.createdAt,
  }));
}

/**
 * The author's own position. Acknowledgement and dispute are the two sides of
 * one switch, and neither of them touches the witness count — that is the
 * whole point of keeping the axes apart.
 */
export async function acknowledgeYap(
  yapId: number,
  teamId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const yap = await prisma.yap.findFirst({
    where: { id: yapId, teamId },
    select: { authorId: true },
  });
  if (!yap) return { ok: false, error: "NOT_FOUND" };
  if (yap.authorId !== userId) return { ok: false, error: "NOT_YOUR_RECORD" };

  await prisma.yap.update({
    where: { id: yapId },
    data: { acknowledgedAt: new Date(), disputedAt: null, disputeStatement: null },
  });
  return { ok: true };
}

export async function withdrawAcknowledgement(
  yapId: number,
  teamId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const yap = await prisma.yap.findFirst({
    where: { id: yapId, teamId },
    select: { authorId: true },
  });
  if (!yap || yap.authorId !== userId) return { ok: false };
  await prisma.yap.update({ where: { id: yapId }, data: { acknowledgedAt: null } });
  return { ok: true };
}

/**
 * A formal dispute, filed only by the person the record is about. The
 * statement stays; the contest is recorded beside it.
 */
export async function disputeYap(
  yapId: number,
  teamId: string,
  userId: string,
  statement: string,
): Promise<{ ok: boolean; error?: string }> {
  const yap = await prisma.yap.findFirst({
    where: { id: yapId, teamId },
    select: { authorId: true, disputedAt: true },
  });
  if (!yap) return { ok: false, error: "NOT_FOUND" };
  if (yap.authorId !== userId) return { ok: false, error: "NOT_YOUR_RECORD" };

  await prisma.yap.update({
    where: { id: yapId },
    data: {
      disputedAt: yap.disputedAt ?? new Date(),
      disputeStatement: statement.trim() ? statement.trim().slice(0, 400) : null,
      // Disputing withdraws any earlier acknowledgement.
      acknowledgedAt: null,
    },
  });
  return { ok: true };
}

/** A yapper may withdraw their own dispute. The witnesses stay either way. */
export async function withdrawDispute(
  yapId: number,
  teamId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const yap = await prisma.yap.findFirst({
    where: { id: yapId, teamId },
    select: { authorId: true },
  });
  if (!yap || yap.authorId !== userId) return { ok: false };
  await prisma.yap.update({
    where: { id: yapId },
    data: { disputedAt: null, disputeStatement: null },
  });
  return { ok: true };
}

export type CreateYapInput = {
  teamId: string;
  text: string;
  authorId: string;
  submittedById: string;
  lore?: string | null;
  saidAt: Date;
  tags: string[];
  classification?: Classification;
};

export async function createYap(input: CreateYapInput): Promise<number> {
  // Both people on a record must belong to the team it is filed under. The
  // author arrives from a form field, so without this a tampered submission
  // could credit a quote to someone in another archive — and that name would
  // then print on the record, in the leaderboard and on their profile.
  // Quoted-only people are members too (findOrCreateYapper enrols them), so
  // this rejects nothing the interface can legitimately ask for.
  const people = [...new Set([input.authorId, input.submittedById])];
  const belong = await prisma.membership.count({
    where: { teamId: input.teamId, userId: { in: people } },
  });
  if (belong !== people.length) throw new Error("NOT_A_MEMBER");

  const tagRecords = await Promise.all(
    input.tags.map((slug) =>
      prisma.tag.upsert({
        where: { teamId_slug: { teamId: input.teamId, slug } },
        update: {},
        create: { teamId: input.teamId, slug, label: slug },
      }),
    ),
  );

  const yap = await prisma.yap.create({
    data: {
      teamId: input.teamId,
      text: input.text,
      authorId: input.authorId,
      submittedById: input.submittedById,
      // Filing your own quote is itself an acknowledgement — no need to make
      // someone press "I said that" about a record they just typed in.
      acknowledgedAt: input.authorId === input.submittedById ? new Date() : null,
      lore: input.lore?.trim() ? input.lore.trim() : null,
      saidAt: input.saidAt,
      classification: input.classification ?? "QUESTIONABLE",
      tags: { create: tagRecords.map((tag) => ({ tagId: tag.id })) },
    },
  });

  // Filing somebody else's line means you were there to hear it, so the
  // archive stops asking you to say so twice: the person who files a record
  // goes on it as a witness. It is testimony like any other and can be
  // withdrawn or flipped to a denial on the record's own page.
  //
  // Not when the two are the same person: the author of a statement cannot
  // corroborate it — that is what makes a witness worth anything — and filing
  // your own words is already recorded above as owning up to them.
  if (input.authorId !== input.submittedById) {
    await prisma.witness.create({
      data: { yapId: yap.id, userId: input.submittedById, stance: "PRESENT" },
    });
    await refreshVerification(yap.id);
  }

  return yap.id;
}

/**
 * Correct the wording of a record.
 *
 * The archive exists to keep what was said, so this is deliberately narrow: it
 * changes the text and the lore and nothing else. Aura, witnesses, the author's
 * acknowledgement and the verification rung all stand — a typo fixed is not a
 * different statement, and people who went on the record about it did so about
 * these words.
 *
 * Whoever runs the team may do it. A misquote is exactly the kind of thing the
 * person quoted will want fixed, and until now the only remedy was redaction.
 */
export async function editYap(
  yapId: number,
  teamId: string,
  userId: string,
  input: { text: string; lore: string | null },
): Promise<{ ok: boolean }> {
  const text = input.text.trim();
  if (text.length < 2 || text.length > 400) return { ok: false };

  const yap = await prisma.yap.findFirst({
    where: { id: yapId, teamId },
    select: { submittedById: true, deletedAt: true },
  });
  if (!yap || yap.deletedAt) return { ok: false };
  if (yap.submittedById !== userId && !(await canModerateTeam(teamId, userId))) {
    return { ok: false };
  }

  await prisma.yap.update({
    where: { id: yapId },
    data: { text, lore: input.lore?.trim() || null },
  });
  return { ok: true };
}

/** REMOVE FROM THE HISTORICAL RECORD? — soft delete, the archive forgets nothing. */
export async function softDeleteYap(
  yapId: number,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const yap = await prisma.yap.findFirst({
    where: { id: yapId, teamId },
    select: { submittedById: true, deletedAt: true },
  });
  if (!yap || yap.deletedAt) return false;

  if (yap.submittedById !== userId && !(await canModerateTeam(teamId, userId))) return false;

  await prisma.yap.update({ where: { id: yapId }, data: { deletedAt: new Date() } });
  return true;
}

/**
 * Whoever runs the team, plus the instance operator. Kept here rather than in
 * the auth module so the service can enforce it without a request context.
 */
async function canModerateTeam(teamId: string, userId: string): Promise<boolean> {
  const [user, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.membership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    }),
  ]);
  return user?.role === "ADMIN" || membership?.role === "OWNER" || membership?.role === "ADMIN";
}

/** Redaction is reversible: the row was never deleted, only hidden. */
export async function restoreYap(
  yapId: number,
  teamId: string,
  userId: string,
): Promise<boolean> {
  if (!(await canModerateTeam(teamId, userId))) return false;
  const result = await prisma.yap.updateMany({
    where: { id: yapId, teamId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  return result.count > 0;
}

export type RedactedRow = {
  id: number;
  code: string;
  text: string;
  author: string;
  deletedAt: Date;
};

/** The admin panel's undo pile. */
export async function listRedacted(teamId: string, take = 25): Promise<RedactedRow[]> {
  const rows = await prisma.yap.findMany({
    where: { teamId, deletedAt: { not: null } },
    include: { author: { select: { displayName: true } } },
    orderBy: { deletedAt: "desc" },
    take,
  });
  return rows.map((row) => ({
    id: row.id,
    code: yapCode(row.id),
    text: row.text,
    author: row.author.displayName,
    deletedAt: row.deletedAt!,
  }));
}

export async function getArchiveStats(teamId: string): Promise<ArchiveStats> {
  const [yapCount, auraSum, certifiedYappers] = await Promise.all([
    prisma.yap.count({ where: { teamId, deletedAt: null } }),
    prisma.yap.aggregate({ where: { teamId, deletedAt: null }, _sum: { aura: true } }),
    prisma.user.count({
      where: { yaps: { some: { teamId, verification: "CERTIFIED", deletedAt: null } } },
    }),
  ]);
  return {
    yapCount,
    totalAura: auraSum._sum.aura ?? 0,
    certifiedYappers,
  };
}

export async function listTags(
  teamId: string,
  take = 24,
): Promise<Array<{ slug: string; label: string; count: number }>> {
  // Counted over living records only. A tag's size is a claim about what the
  // archive currently holds, and a redacted record is not held: counting it
  // both inflates the number and keeps tags in the list whose every record is
  // gone, so the cloud offers a link to an empty page.
  //
  // The count has to drive the ordering too, which is why this groups the join
  // table rather than asking for a filtered `_count` — `take` applied to the
  // unfiltered order would pick the wrong tags before the filter ever ran.
  const counts = await prisma.yapTag.groupBy({
    by: ["tagId"],
    where: { yap: { teamId, deletedAt: null } },
    _count: { _all: true },
    orderBy: { _count: { tagId: "desc" } },
    take,
  });
  if (counts.length === 0) return [];

  const tags = await prisma.tag.findMany({
    where: { teamId, id: { in: counts.map((row) => row.tagId) } },
    select: { id: true, slug: true, label: true },
  });
  const byId = new Map(tags.map((tag) => [tag.id, tag]));

  return counts.flatMap((row) => {
    const tag = byId.get(row.tagId);
    return tag ? [{ slug: tag.slug, label: tag.label, count: row._count._all }] : [];
  });
}
