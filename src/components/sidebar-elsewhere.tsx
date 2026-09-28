import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { getDictionary } from "@/lib/i18n/server";

/**
 * One quiet list instead of four competing cards. Secondary destinations are
 * ambient UI: they should be findable, not read.
 */
export async function SidebarElsewhere({
  entries,
}: {
  entries: Array<{ href: string; label: string; note?: string }>;
}) {
  const d = await getDictionary();
  return (
    <Panel label={d.feed.elsewhere} bodyClassName="p-0">
      <ul>
        {entries.map((entry) => (
          <li key={entry.href}>
            <Link
              href={entry.href}
              className="flex items-baseline justify-between gap-3 border-b border-ink px-3 py-2 last:border-b-0 transition-colors duration-100 hover:bg-paper-2"
            >
              <span className="label-strong">{entry.label}</span>
              {entry.note ? <span className="label truncate">{entry.note}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
