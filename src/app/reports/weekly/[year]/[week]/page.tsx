import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { IncidentReportView } from "@/components/incident-report";
import { requireViewer } from "@/lib/auth/team";
import { fill } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/server";
import { isoWeeksInYear } from "@/lib/iso-week";
import { getIncidentReport } from "@/lib/services/incidents";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ year: string; week: string }> };

/**
 * `/reports/weekly/2026/45`. The ISO year, which is not always the calendar
 * year the dates fall in — 1 January is frequently week 53 of the year before,
 * and a URL that conflated the two would point at a different period.
 */
function parseWeek(rawYear: string, rawWeek: string): { isoYear: number; isoWeek: number } | null {
  const isoYear = Number(rawYear);
  const isoWeek = Number(rawWeek);
  if (!Number.isInteger(isoYear) || isoYear < 2000 || isoYear > 2200) return null;
  if (!Number.isInteger(isoWeek) || isoWeek < 1) return null;
  if (isoWeek > isoWeeksInYear(isoYear)) return null;
  return { isoYear, isoWeek };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { year, week } = await params;
  const parsed = parseWeek(year, week);
  if (!parsed) notFound();
  const d = await getDictionary();
  return {
    title: `${fill(d.report.weekOf, { week: parsed.isoWeek, year: parsed.isoYear })} — ${d.pageTitles.weeklyReport}`,
  };
}

export default async function DatedWeeklyReportPage({ params }: Params) {
  const { year, week } = await params;
  const parsed = parseWeek(year, week);
  if (!parsed) notFound();

  const { team } = await requireViewer(`/reports/weekly/${year}/${week}`);
  const report = await getIncidentReport(team.id, team.timezone, parsed);
  if (!report) {
    const d = await getDictionary();
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState title={d.report.notOnFile} hint={d.report.notOnFileNote} />
      </div>
    );
  }
  return <IncidentReportView report={report} />;
}
