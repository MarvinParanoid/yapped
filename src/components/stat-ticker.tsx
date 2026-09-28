import { formatCount } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import { getDictionary } from "@/lib/i18n/server";
import type { ArchiveStats } from "@/lib/types";

export async function StatTicker({ stats }: { stats: ArchiveStats }) {
  const d = await getDictionary();
  const cells = [
    { value: formatCount(stats.yapCount), label: d.feed.archived },
    { value: formatAura(stats.totalAura), label: d.feed.totalAura },
    { value: formatCount(stats.certifiedYappers), label: d.feed.certified },
  ];

  return (
    <div className="grid grid-cols-2 border-x border-b border-ink sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="border-b border-r border-ink px-4 py-3 last:border-r-0 sm:border-b-0">
          <div className="mono tabnums text-[22px] font-bold leading-none">{cell.value}</div>
          <div className="label mt-1.5">{cell.label}</div>
        </div>
      ))}
      <div className="flex items-center border-r border-ink px-4 py-3 last:border-r-0">
        <p className="label leading-[1.5]">{d.feed.motto}</p>
      </div>
    </div>
  );
}
