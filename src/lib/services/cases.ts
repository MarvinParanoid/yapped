import { prisma } from "@/lib/db";
import { yapCode } from "@/lib/format";
import type { YapView } from "@/lib/types";
import { getYap } from "./yaps";

export type CaseStatus = "OPEN" | "CLOSED" | "COLD";

export const CASE_STATUS_META: Record<CaseStatus, { label: string; blurb: string }> = {
  OPEN: { label: "Open", blurb: "Still unfolding." },
  CLOSED: { label: "Closed", blurb: "The episode has an ending." },
  COLD: { label: "Cold", blurb: "Nobody ever found out what happened." },
};

/** 7 → "#0007" — cases are numbered separately from records. */
export function caseCode(id: number): string {
  return `#${String(id).padStart(4, "0")}`;
}

export type CaseSummary = {
  id: number;
  code: string;
  title: string;
  summary: string | null;
  status: CaseStatus;
  openedAt: Date;
  closedAt: Date | null;
  recordCount: number;
  witnessCount: number;
  evidenceCount: number;
  totalAura: number;
  /** The span the incident covers, taken from the records themselves. */
  from: Date | null;
  to: Date | null;
  headline: { id: number; code: string; text: string } | null;
};

type CaseRow = {
  id: number;
  title: string;
  summary: string | null;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  records: Array<{
    position: number;
    yap: {
      id: number;
      text: string;
      aura: number;
      saidAt: Date;
      witnessCount: number;
      _count: { evidence: number };
    };
  }>;
};

const caseInclude = {
  records: {
    orderBy: { position: "asc" },
    include: {
      yap: {
        select: {
          id: true,
          text: true,
          aura: true,
          saidAt: true,
          witnessCount: true,
          _count: { select: { evidence: true } },
        },
      },
    },
  },
} as const;

function toSummary(row: CaseRow): CaseSummary {
  const members = row.records.filter((entry) => entry.yap !== null);
  const dates = members.map((entry) => entry.yap.saidAt).sort((a, b) => a.getTime() - b.getTime());
  const headline = [...members].sort((a, b) => b.yap.aura - a.yap.aura)[0]?.yap ?? null;

  return {
    id: row.id,
    code: caseCode(row.id),
    title: row.title,
    summary: row.summary,
    status: row.status as CaseStatus,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    recordCount: members.length,
    witnessCount: members.reduce((sum, entry) => sum + entry.yap.witnessCount, 0),
    evidenceCount: members.reduce((sum, entry) => sum + entry.yap._count.evidence, 0),
    totalAura: members.reduce((sum, entry) => sum + entry.yap.aura, 0),
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    headline: headline
      ? { id: headline.id, code: yapCode(headline.id), text: headline.text }
      : null,
  };
}

export async function listCases(teamId: string): Promise<CaseSummary[]> {
  const rows = await prisma.case.findMany({
    where: { teamId, records: { some: { yap: { deletedAt: null } } } },
    include: caseInclude,
    orderBy: { openedAt: "desc" },
  });
  return rows.map((row) => toSummary(row as CaseRow));
}

export type CaseFile = CaseSummary & { records: YapView[] };

export async function getCase(
  id: number,
  teamId: string,
  viewerId?: string | null,
): Promise<CaseFile | null> {
  const row = await prisma.case.findFirst({ where: { id, teamId }, include: caseInclude });
  if (!row) return null;

  const summary = toSummary(row as CaseRow);
  const records = await Promise.all(
    row.records.map((entry) => getYap(entry.yap.id, teamId, viewerId)),
  );

  return {
    ...summary,
    records: records.filter((record): record is YapView => record !== null),
  };
}

/** Which case, if any, a record belongs to — shown on the record's own page. */
export async function getCasesForYap(yapId: number, teamId: string): Promise<CaseSummary[]> {
  const rows = await prisma.case.findMany({
    where: { teamId, records: { some: { yapId } } },
    include: caseInclude,
  });
  return rows.map((row) => toSummary(row as CaseRow));
}

export async function createCase(input: {
  teamId: string;
  title: string;
  summary?: string | null;
  createdById: string;
  yapId?: number;
}): Promise<number> {
  const created = await prisma.case.create({
    data: {
      teamId: input.teamId,
      title: input.title.trim().slice(0, 120),
      summary: input.summary?.trim() ? input.summary.trim().slice(0, 600) : null,
      createdById: input.createdById,
      ...(input.yapId ? { records: { create: { yapId: input.yapId, position: 1 } } } : {}),
    },
  });
  return created.id;
}

/** Records are ordered by when they were said, not by when they were filed. */
export async function addYapToCase(
  caseId: number,
  yapId: number,
  teamId: string,
): Promise<void> {
  // Both sides must belong to the same team, or a case could reach across one.
  const pair = await prisma.case.findFirst({
    where: { id: caseId, teamId, team: { yaps: { some: { id: yapId } } } },
    select: { id: true },
  });
  if (!pair) throw new Error("NOT_FOUND");

  const existing = await prisma.caseYap.findUnique({
    where: { caseId_yapId: { caseId, yapId } },
  });
  if (existing) return;

  await prisma.caseYap.create({ data: { caseId, yapId, position: 0 } });
  await resequence(caseId);
}

async function resequence(caseId: number): Promise<void> {
  const members = await prisma.caseYap.findMany({
    where: { caseId },
    include: { yap: { select: { saidAt: true } } },
  });
  const ordered = [...members].sort(
    (a, b) => a.yap.saidAt.getTime() - b.yap.saidAt.getTime(),
  );
  await prisma.$transaction(
    ordered.map((entry, index) =>
      prisma.caseYap.update({
        where: { caseId_yapId: { caseId: entry.caseId, yapId: entry.yapId } },
        data: { position: index + 1 },
      }),
    ),
  );
}

export type FilableCase = { id: number; code: string; title: string; status: CaseStatus };

/**
 * Every case a record can be filed under. Closed cases are included — new
 * evidence for an old episode is exactly the kind of thing this archive is for
 * — but they are labelled, so filing into one is a deliberate act.
 */
export async function listFilableCases(teamId: string): Promise<FilableCase[]> {
  const rows = await prisma.case.findMany({
    where: { teamId },
    orderBy: { openedAt: "desc" },
    take: 25,
    select: { id: true, title: true, status: true },
  });
  return rows
    .map((row) => ({
      id: row.id,
      code: caseCode(row.id),
      title: row.title,
      status: row.status as CaseStatus,
    }))
    .sort((a, b) => Number(a.status === "CLOSED") - Number(b.status === "CLOSED"));
}
