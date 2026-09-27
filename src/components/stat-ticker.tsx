import { formatCount } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import type { ArchiveStats } from "@/lib/types";

export function StatTicker({ stats }: { stats: ArchiveStats }) {
  const cells = [
    { value: formatCount(stats.yapCount), label: "yaps archived" },
    { value: formatAura(stats.totalAura), label: "total aura" },
    { value: formatCount(stats.certifiedYappers), label: "certified yappers" },
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
        <p className="label leading-[1.5]">
          the internet forgets.
          <br />
          we don&apos;t.
        </p>
      </div>
    </div>
  );
}
