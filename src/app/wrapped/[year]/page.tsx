import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WrappedReportView } from "@/components/wrapped-report";
import { requireViewer } from "@/lib/auth/team";
import { getWrapped, listPeriods, periodLabel } from "@/lib/services/wrapped";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ year: string }> };

function parseYear(raw: string): number | null {
  const year = Number(raw);
  return Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { year } = await params;
  const parsed = parseYear(year);
  if (!parsed) notFound();
  return { title: `${periodLabel({ year: parsed, month: null })} wrapped` };
}

export default async function WrappedYearPage({ params }: Params) {
  const { year } = await params;
  const parsed = parseYear(year);
  if (!parsed) notFound();

  const { team } = await requireViewer(`/wrapped/${parsed}`);
  const [report, periods] = await Promise.all([
    getWrapped({ year: parsed, month: null }, team.id),
    listPeriods(team.id),
  ]);

  const years = periods.filter((period) => period.month === null);
  const index = years.findIndex((period) => period.year === parsed);

  return (
    <WrappedReportView
      report={report}
      previous={index >= 0 ? (years[index + 1] ?? null) : null}
      next={index > 0 ? (years[index - 1] ?? null) : null}
    />
  );
}
