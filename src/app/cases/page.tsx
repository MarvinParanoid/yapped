import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatCount, formatDate } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import { requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { CASE_STATUS_META, listCases } from "@/lib/services/cases";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Case files" };

export default async function CasesPage() {
  const { team } = await requireViewer("/cases");
  const d = await getDictionary();
  const cases = await listCases(team.id);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">{d.sections.episodes}</span>
          <h1 className="quote mt-2 text-[clamp(2rem,6vw,4rem)]">{d.sections.caseFiles}</h1>
        </div>
        <p className="label max-w-[34ch] leading-[1.6]">
          {d.sections.caseIntro}
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={d.empty.noCases}
            hint={d.empty.noCasesHint}
          />
        </div>
      ) : (
        <ol className="mt-8 border border-ink">
          {cases.map((file) => (
            <li key={file.id} className="border-b border-ink last:border-b-0">
              <Link
                href={`/case/${file.id}`}
                className="block px-4 py-4 transition-colors duration-100 hover:bg-paper-2"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="mono text-[11px] tracking-[0.1em] text-muted">
                    Case {file.code}
                  </span>
                  <span
                    className={cn(
                      "border px-2 py-1 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.12em]",
                      file.status === "CLOSED"
                        ? "border-ink bg-transparent"
                        : file.status === "COLD"
                          ? "border-muted text-muted"
                          : "border-ink bg-acid",
                    )}
                  >
                    {CASE_STATUS_META[file.status].label}
                  </span>
                  <span className="label">
                    {file.from ? formatDate(file.from) : "—"}
                    {file.to && file.from && file.to.getTime() !== file.from.getTime()
                      ? ` — ${formatDate(file.to)}`
                      : ""}
                  </span>
                </div>

                <h2 className="quote mt-2 text-[clamp(1.4rem,3.2vw,2.2rem)]">{file.title}</h2>

                {file.headline ? (
                  <p className="mt-2 truncate text-[14px] italic text-muted">
                    “{file.headline.text}”
                  </p>
                ) : null}

                {/* Counts that are zero are dropped rather than printed: "0
                    pieces of evidence" tells you nothing a silent row does not,
                    and three of them in a line read as a broken widget. Records
                    always show, because a case without any is the real news. */}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                  <span className="label">{formatCount(file.recordCount)} records</span>
                  {file.witnessCount > 0 ? (
                    <span className="label">{formatCount(file.witnessCount)} witnesses</span>
                  ) : null}
                  {file.evidenceCount > 0 ? (
                    <span className="label">
                      {formatCount(file.evidenceCount)}{" "}
                      {file.evidenceCount === 1 ? "piece of evidence" : "pieces of evidence"}
                    </span>
                  ) : null}
                  <span className="label">{formatAura(file.totalAura)} aura</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
