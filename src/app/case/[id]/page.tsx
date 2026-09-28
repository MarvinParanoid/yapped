import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { YapCard } from "@/components/yap-card";
import { getViewer, requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { cn } from "@/lib/cn";
import { formatCount, formatDate } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import { CASE_STATUS_META, caseCode, getCase } from "@/lib/services/cases";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return { title: "Yapped." };
  const file = await getCase(Number(id), viewer.team.id);
  if (!file) notFound();
  return { title: `${file.title} — case ${caseCode(file.id)}` };
}

export default async function CasePage({ params }: Params) {
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId)) notFound();

  const { user, team } = await requireViewer(`/case/${id}`);
  const d = await getDictionary();
  const months = d.profile.months.split(" ");
  const file = await getCase(caseId, team.id, user.id);
  if (!file) notFound();

  const figures = [
    { value: formatCount(file.recordCount), label: d.sections.records },
    { value: formatCount(file.witnessCount), label: d.sections.witnesses },
    { value: formatCount(file.evidenceCount), label: d.sections.evidence },
    { value: formatAura(file.totalAura), label: d.profile.aura },
  ];

  return (
    <article>
      <div className="on-ink grid-ghost border-b border-ink">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/cases" className="label hover:text-acid">
              ← Case files
            </Link>
            <span className="mono text-[11px] tracking-[0.1em] text-muted-dark">
              Case {file.code}
            </span>
            <span
              className={cn(
                "border px-2 py-1 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.12em]",
                file.status === "OPEN"
                  ? "border-acid bg-acid text-ink"
                  : file.status === "COLD"
                    ? "border-muted-dark text-muted-dark"
                    : "border-paper text-paper",
              )}
            >
              {CASE_STATUS_META[file.status].label}
            </span>
          </div>

          <h1 className="quote mt-5 text-[clamp(2rem,6vw,4.2rem)] text-paper">{file.title}</h1>

          <p className="label mt-3">
            {file.from ? formatDate(file.from, months) : "—"}
            {file.to && file.from && file.to.getTime() !== file.from.getTime()
              ? ` — ${formatDate(file.to, months)}`
              : ""}{" "}
            · {CASE_STATUS_META[file.status].blurb}
          </p>

          {file.summary ? (
            <p className="mt-6 max-w-[68ch] text-[15px] leading-[1.6] text-paper sm:text-[16px]">
              {file.summary}
            </p>
          ) : null}

          <dl className="mt-8 grid grid-cols-2 border-l border-t border-paper/20 sm:grid-cols-4">
            {figures.map((figure) => (
              <div key={figure.label} className="border-b border-r border-paper/20 px-4 py-4">
                <dd className="mono tabnums text-[24px] font-bold leading-none text-acid sm:text-[28px]">
                  {figure.value}
                </dd>
                <dt className="label mt-2">{figure.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
        <h2 className="label-strong border-b border-ink pb-2">{d.sections.chronology}</h2>

        {/* A rail, so the episode reads in order rather than as a pile of cards. */}
        <ol className="mt-6">
          {file.records.map((record, index) => (
            <li key={record.id} className="flex gap-3 sm:gap-5">
              <div className="flex w-[34px] shrink-0 flex-col items-center sm:w-[52px]">
                <span className="mono text-[12px] font-bold leading-none">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "mt-2 w-px flex-1",
                    index === file.records.length - 1 ? "bg-transparent" : "bg-ink",
                  )}
                />
              </div>
              <div className="min-w-0 flex-1 pb-6">
                <YapCard yap={record} viewerId={user?.id} emphasis="standard" />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}
