import { ArchiveLoading } from "@/components/ui/archive-loading";
import { getDictionary } from "@/lib/i18n/server";

export default async function Loading() {
  const d = await getDictionary();
  return <ArchiveLoading label={d.feed.rankingYappers} />;
}
