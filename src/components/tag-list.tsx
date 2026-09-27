import Link from "next/link";
import { cn } from "@/lib/cn";
import type { TagView } from "@/lib/types";

export function TagList({
  tags,
  className,
  max,
}: {
  tags: TagView[];
  className?: string;
  max?: number;
}) {
  const shown = max ? tags.slice(0, max) : tags;
  if (shown.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {shown.map((tag) => (
        <Link
          key={tag.slug}
          href={`/?tag=${encodeURIComponent(tag.slug)}`}
          className="font-mono text-[11px] lowercase tracking-tight text-muted transition-colors duration-100 hover:text-ink"
        >
          #{tag.label}
        </Link>
      ))}
    </div>
  );
}
