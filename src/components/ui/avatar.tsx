import Image from "next/image";
import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Neutral tones only — the acid accent stays reserved for meaning. */
const TONES = [
  "bg-ink text-paper",
  "bg-paper-3 text-ink",
  "bg-ink-3 text-paper",
  "bg-[#c9c4b6] text-ink",
  "bg-muted text-paper",
  "bg-paper-2 text-ink",
];

function toneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("border border-ink object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center border border-ink font-mono font-bold leading-none tracking-tight",
        toneFor(name),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) }}
    >
      {initials(name)}
    </span>
  );
}
