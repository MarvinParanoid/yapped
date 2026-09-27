import { formatAura } from "@/lib/ranking/aura";
import { quoteSizeClass } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { YapView } from "@/lib/types";

/**
 * Fixed 1200×630 share card. Kept free of interactivity and layout context so
 * a server-side image generator can render exactly this component later.
 */
export function ShareCard({ yap }: { yap: YapView }) {
  return (
    <div
      className="on-ink relative flex flex-col justify-between overflow-hidden"
      style={{ width: 1200, height: 630 }}
    >
      <div className="grid-ghost absolute inset-0" />

      <div className="relative flex items-start justify-between px-16 pt-14">
        <span className="wordmark text-[38px] text-paper">yapped.</span>
        <span className="mono text-[18px] tracking-[0.18em] text-muted-dark">{yap.code}</span>
      </div>

      <div className="relative px-16">
        <p
          className={cn(
            "quote text-paper",
            yap.text.length > 150 && "quote-lower",
            quoteSizeClass(yap.text, "detail"),
          )}
        >
          <span className="opacity-40">“</span>
          {yap.text}
          <span className="opacity-40">”</span>
        </p>
        <p className="mt-8 text-[30px] font-bold text-paper">
          — {yap.author.displayName}, {yap.saidAt.getUTCFullYear()}
        </p>
      </div>

      <div className="relative flex items-end justify-between border-t border-paper/20 px-16 py-10">
        <span className="mono text-[46px] font-bold leading-none text-acid">
          {formatAura(yap.aura)}
          <span className="ml-3 align-middle font-mono text-[18px] tracking-[0.18em] text-muted-dark">
            AURA
          </span>
        </span>
        <span className="mono text-[16px] tracking-[0.18em] text-muted-dark">
          the internet forgets. we don&apos;t.
        </span>
      </div>
    </div>
  );
}
