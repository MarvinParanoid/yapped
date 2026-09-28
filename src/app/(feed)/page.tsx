import Link from "next/link";
import { Suspense } from "react";
import { FeedControls } from "@/components/feed-controls";
import { SidebarElsewhere } from "@/components/sidebar-elsewhere";
import { SidebarLeaders } from "@/components/sidebar-leaders";
import { StatTicker } from "@/components/stat-ticker";
import { YapCard } from "@/components/yap-card";
import { EmptyState, FirstRun } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { assignEmphasis, tagWeight } from "@/lib/archival";
import { describeFilter, isEmptyFilter, parseSearch, type FilterChip } from "@/lib/search";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/lib/auth/team";
import type { Dictionary } from "@/lib/i18n/en";
import { fill, plural } from "@/lib/i18n/locale";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { countYaps, getArchiveStats, listTags, listYaps } from "@/lib/services/yaps";
import { getLeaderboard } from "@/lib/services/yappers";
import { getMomentum } from "@/lib/services/aura-history";
import { hasAnniversaryToday } from "@/lib/services/on-this-day";
import { listPeriods, periodLabel, periodSlug } from "@/lib/services/wrapped";
import type { RangeKey, SortKey } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A filter chip, worded. The parser hands back keys; this says them. */
function chipLabel(chip: FilterChip, d: Dictionary): string {
  switch (chip.kind) {
    case "text":
      return `“${chip.value}”`;
    case "tag":
      return `#${chip.value}`;
    case "verification":
      return d.verification[chip.value].toLowerCase();
    case "saidBy":
      return fill(d.search.saidBy, { name: chip.name });
    case "filedBy":
      return fill(d.search.filedBy, { name: chip.name });
    case "caseChip":
      return fill(d.search.caseChip, { n: chip.n });
    case "auraChip":
      return fill(d.search.auraChip, { op: chip.op, value: chip.value });
    case "hasChip":
      return fill(d.search.hasChip, { what: chip.what });
    case "disputedChip":
      return d.search.disputedChip;
    case "afterChip":
      return fill(d.search.afterChip, { date: chip.date });
    case "beforeChip":
      return fill(d.search.beforeChip, { date: chip.date });
  }
}

const SORTS = new Set<SortKey>(["trending", "fresh", "top"]);

/**
 * Each section gets its own windows and its own default. Trending has no
 * all-time window — "what is moving now" over all time is not a thing — and
 * Fresh is ordered by arrival, so it ignores the window entirely.
 */
const ALLOWED_RANGES: Record<SortKey, RangeKey[]> = {
  trending: ["all"],
  top: ["today", "week", "month", "all"],
  fresh: ["all"],
};

const DEFAULT_RANGE: Record<SortKey, RangeKey> = {
  trending: "all",
  top: "all",
  fresh: "all",
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sortParam = read("sort") as SortKey | undefined;
  const rangeParam = read("range") as RangeKey | undefined;
  const sort: SortKey = sortParam && SORTS.has(sortParam) ? sortParam : "trending";
  const range: RangeKey =
    rangeParam && ALLOWED_RANGES[sort].includes(rangeParam)
      ? rangeParam
      : DEFAULT_RANGE[sort];
  const query = read("q") ?? "";
  const tag = read("tag") ?? "";
  const pageParam = Number(read("page") ?? "1");
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  // `q` carries GitHub-style qualifiers; anything left over is free text.
  const filter = parseSearch(query);
  // Any query at all puts the feed in search mode — including one that parsed
  // to nothing, so an unrecognised qualifier is reported rather than silently
  // returning the ordinary feed.
  const filtering = Boolean(query.trim()) || Boolean(tag);
  const narrowed = !isEmptyFilter(filter) || Boolean(tag);
  // Searching is its own mode: it runs over the whole archive, and the window
  // control steps aside rather than silently hiding older matches.
  const effectiveRange: RangeKey = filtering ? "all" : range;

  const viewer = await requireViewer("/");
  const [d, locale] = await Promise.all([getDictionary(), getLocale()]);
  const teamId = viewer.team.id;
  const user = viewer.user;
  const PER_PAGE = 25;
  const listOptions = { teamId, sort, range: effectiveRange, filter, tag };

  const [stats, yaps, total, leaders, tags, periods] = await Promise.all([
    getArchiveStats(teamId),
    listYaps({ ...listOptions, viewerId: user.id, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
    countYaps(listOptions),
    getLeaderboard(teamId, "all", 6),
    listTags(teamId, 30),
    listPeriods(teamId),
  ]);
  // Only offered when there is actually something to remember.
  const anniversaries = await hasAnniversaryToday(teamId);

  // Movement is only meaningful where the sort is about movement.
  // Movement is measured over a month, not a day: at this volume a shorter
  // window would mark almost everything dormant.
  const momentum =
    sort === "trending" && !filtering
      ? await getMomentum(yaps.map((yap) => yap.id), 24 * 30)
      : null;
  const latestPeriod = periods.find((period) => period.month !== null) ?? null;

  const emphasis = assignEmphasis(yaps);
  // Secondary panels arrive as the archive fills out, rather than sitting there
  // announcing how little is in it.
  const MIN_TAGS_SHOWN = 5;
  const showTags = tags.length >= MIN_TAGS_SHOWN;
  const elsewhere = [
    { href: "/random", label: d.nav.random, note: d.feed.randomNote },
    { href: "/battle/hall", label: d.feed.hallOfYap, note: d.feed.hallNote },
    { href: "/market", label: d.feed.auraMarket, note: d.feed.marketNote },
    ...(latestPeriod
      ? [{ href: periodSlug(latestPeriod), label: d.feed.wrapped, note: periodLabel(latestPeriod) }]
      : []),
    ...(anniversaries > 0
      ? [
          {
            href: "/on-this-day",
            label: d.feed.onThisDay,
            note: fill(d.feed.fromEarlierYears, { n: anniversaries }),
          },
        ]
      : []),
  ];
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    if (sort !== "trending") search.set("sort", sort);
    if (effectiveRange !== "all") search.set("range", effectiveRange);
    if (query) search.set("q", query);
    if (tag) search.set("tag", tag);
    if (target > 1) search.set("page", String(target));
    const qs = search.toString();
    return qs ? `/?${qs}` : "/";
  };
  // An empty archive is a first day, not a failure.
  const archiveEmpty = stats.yapCount === 0;
  const maxTagCount = tags[0]?.count ?? 1;

  const TAG_STYLES = [
    "text-[10px] text-muted",
    "text-[11px] text-ink/70",
    "text-[13px] font-bold text-ink",
    "text-[16px] font-bold text-ink",
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6 lg:px-8">
      <StatTicker stats={stats} />

      {archiveEmpty ? (
        <div className="mt-8">
          <FirstRun signedIn={Boolean(user)} />
        </div>
      ) : null}

      <div
        className={cn(
          "mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10",
          archiveEmpty && "hidden",
        )}
      >
        <div className="min-w-0">
          {filtering ? null : (
            <Suspense fallback={<div className="h-[37px] border-b border-ink" />}>
              <FeedControls sort={sort} range={range} />
            </Suspense>
          )}

          {filtering ? (
            <div className="mt-4 border border-ink bg-ink px-3 py-2 text-paper">
              <div className="flex flex-wrap items-center gap-2">
                <span className="label text-paper">
                  {narrowed ? d.feed.filteringBy : d.feed.noFilter}
                </span>
                {tag ? (
                  <span className="mono border border-paper/30 px-2 py-0.5 text-[12px]">
                    #{tag}
                  </span>
                ) : null}
                {describeFilter(filter).map((chip, index) => (
                  <span
                    key={`${chip.kind}-${index}`}
                    className="mono border border-paper/30 px-2 py-0.5 text-[12px]"
                  >
                    {chipLabel(chip, d)}
                  </span>
                ))}
                <span className="label">
                  {yaps.length}{" "}
                  {plural(locale, yaps.length, [
                    d.feed.recordOne,
                    d.feed.recordFew,
                    d.feed.recordMany,
                  ])}
                </span>
                <Link href="/" className="label ml-auto text-paper hover:text-acid">
                  {d.feed.clear} ✕
                </Link>
              </div>
              {filter.unknown.length > 0 ? (
                <p className="label mt-1.5 text-red">
                  {fill(d.feed.ignored, { what: filter.unknown.join(" ") })}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6">
            {yaps.length === 0 ? (
              <EmptyState
                hint={
                  query || tag
                    ? "no record matches that"
                    : "nothing in this window — try a wider one"
                }
              />
            ) : (
              yaps.map((yap) => (
                <YapCard
                  key={yap.id}
                  yap={yap}
                  viewerId={user.id}
                  emphasis={emphasis.get(yap.id)}
                  momentum={momentum?.get(yap.id)}
                />
              ))
            )}
          </div>

          {pageCount > 1 ? (
            <nav className="mt-6 flex items-center justify-between border border-ink px-3 py-2">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="btn">
                  ← Earlier
                </Link>
              ) : (
                <span />
              )}
              <span className="label">
                page {page} of {pageCount} · {total}{" "}
                {total === 1 ? "record" : "records"} on file
              </span>
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} className="btn">
                  Further back →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>

        <aside className="hidden flex-col gap-6 lg:flex">
          <div className="sticky top-[120px] flex flex-col gap-6">
            <SidebarLeaders entries={leaders} />

            {/* Size is frequency: the team's vocabulary, ranked by damage.
                Hidden until there is enough of one to rank. */}
            {showTags ? (
            <Panel label={d.feed.tags} bodyClassName="px-3 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {tags.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/?tag=${encodeURIComponent(item.slug)}`}
                    title={`${item.count} ${item.count === 1 ? "yap" : "yaps"}`}
                    className={cn(
                      "font-mono leading-tight transition-colors duration-100 hover:text-acid-deep",
                      TAG_STYLES[tagWeight(item.count, maxTagCount)],
                    )}
                  >
                    #{item.label}
                  </Link>
                ))}
              </div>
            </Panel>
            ) : null}

            <Link href="/battle" className="group block border border-ink bg-ink p-4 text-paper">
              <span className="label text-muted-dark">{d.feed.battleKicker}</span>
              <span className="quote mt-2 block text-[22px] leading-[0.95]">
                {d.feed.battlePrompt}
              </span>
              <span className="label mt-3 block text-acid">{d.feed.enterArena} →</span>
            </Link>

            <SidebarElsewhere entries={elsewhere} />
          </div>
        </aside>
      </div>
    </div>
  );
}
