import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { IncidentReportView } from "@/components/incident-report";
import { requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { getLatestIncidentReport } from "@/lib/services/incidents";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDictionary();
  return { title: d.pageTitles.weeklyReport };
}

/**
 * The department's front desk: the last completed week.
 *
 * Rendered here rather than redirected to a dated URL, so `/reports/weekly`
 * stays a stable link that always means "the latest one". Every link *out* of
 * a report carries an explicit week.
 */
export default async function WeeklyReportPage() {
  const { team } = await requireViewer("/reports/weekly");
  const report = await getLatestIncidentReport(team.id, team.timezone);
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
