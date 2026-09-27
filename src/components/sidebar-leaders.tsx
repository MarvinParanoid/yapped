import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Panel } from "@/components/ui/panel";
import { formatAura } from "@/lib/ranking/aura";
import type { LeaderboardEntry } from "@/lib/types";

export function SidebarLeaders({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <Panel
      label="Top yappers"
      bodyClassName="p-0"
      action={
        <Link href="/yappers" className="label hover:text-ink">
          All →
        </Link>
      }
    >
      {entries.length === 0 ? (
        <p className="label px-3 py-4">no known yappers</p>
      ) : null}
      <ol>
        {entries.map((entry) => (
          <li key={entry.yapper.id} className="border-b border-ink last:border-b-0">
            <Link
              href={`/yapper/${entry.yapper.id}`}
              className="flex items-center gap-2.5 px-3 py-2 transition-colors duration-100 hover:bg-paper-2"
            >
              <span className="mono w-4 text-[11px] text-muted">{entry.rank}</span>
              <Avatar name={entry.yapper.displayName} src={entry.yapper.avatarUrl} size={24} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {entry.yapper.displayName}
              </span>
              <span className="mono tabnums text-[11px] font-bold">{formatAura(entry.totalAura)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
