import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/server";
import { WrappedReportView } from "@/components/wrapped-report";
import { requireViewer } from "@/lib/auth/team";
import { getWrapped, listPeriods, periodLabel } from "@/lib/services/wrapped";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ year: string; month: string }> };

function parse(raw: { year: string; month: string }): { year: number; month: number } | null {
  const year = Number(raw.year);
  const month = Number(raw.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const parsed = parse(await params);
  if (!parsed) notFound();
  const d = await getDictionary();
  return { title: `${periodLabel(parsed)} ${d.pageTitles.wrapped}` };
}

export default async function WrappedMonthPage({ params }: Params) {
  const parsed = parse(await params);
  if (!parsed) notFound();

  const { team } = await requireViewer(`/wrapped/${parsed.year}/${parsed.month}`);
  const [report, periods] = await Promise.all([
    getWrapped(parsed, team.id, team.timezone),
    listPeriods(team.id, team.timezone),
  ]);

  const months = periods.filter((period) => period.month !== null);
  const index = months.findIndex(
    (period) => period.year === parsed.year && period.month === parsed.month,
  );

  return (
    <WrappedReportView
      report={report}
      previous={index >= 0 ? (months[index + 1] ?? null) : null}
      next={index > 0 ? (months[index - 1] ?? null) : null}
    />
  );
}
