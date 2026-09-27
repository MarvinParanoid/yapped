"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reactAction } from "@/app/actions";
import { cn } from "@/lib/cn";
import {
  REACTION_KEYS,
  REACTION_META,
  REACTION_WEIGHTS,
  formatAura,
  type ReactionCounts,
  type ReactionKey,
} from "@/lib/ranking/aura";

type Size = "compact" | "sm" | "lg" | "feature";

const CHIP: Record<Size, string> = {
  compact: "px-1.5 py-1 text-[10px] gap-1",
  sm: "px-2 py-1.5 text-[11px] gap-1.5",
  lg: "px-3 py-2 text-[13px] gap-1.5",
  feature: "px-2.5 py-2 text-[12px] gap-1.5",
};

const EMOJI: Record<Size, string> = {
  compact: "text-[12px]",
  sm: "text-[13px]",
  lg: "text-[15px]",
  feature: "text-[14px]",
};

/** Wide enough for two digits, which is as far as this archive tends to get. */
const COUNT_SLOT: Record<Size, string> = {
  compact: "min-w-[1.1em]",
  sm: "min-w-[1.1em]",
  lg: "min-w-[1.2em]",
  feature: "min-w-[1.2em]",
};

const AURA_NUMBER: Record<Size, string> = {
  compact: "text-[13px]",
  sm: "text-[17px]",
  lg: "text-[22px]",
  feature: "text-[26px]",
};

export function ReactionBar({
  yapId,
  counts: initialCounts,
  viewerReactions: initialMine,
  aura: initialAura,
  size = "sm",
  showAura = true,
  signedIn = true,
}: {
  yapId: number;
  counts: ReactionCounts;
  viewerReactions: ReactionKey[];
  aura: number;
  size?: Size;
  showAura?: boolean;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [counts, setCounts] = useState(initialCounts);
  const [mine, setMine] = useState<ReactionKey[]>(initialMine);
  const [aura, setAura] = useState(initialAura);
  const [pulse, setPulse] = useState<{ key: ReactionKey; delta: number; id: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const [, startTransition] = useTransition();

  function react(key: ReactionKey) {
    // Guests get a straight answer instead of a count that bumps, rolls back
    // and then throws them somewhere a second later.
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const has = mine.includes(key);
    const delta = has ? -REACTION_WEIGHTS[key] : REACTION_WEIGHTS[key];

    // Optimistic: the archive is fast, or it is nothing.
    setCounts((prev) => ({ ...prev, [key]: Math.max(0, prev[key] + (has ? -1 : 1)) }));
    setMine((prev) => (has ? prev.filter((item) => item !== key) : [...prev, key]));
    setAura((prev) => prev + delta);
    setPulse({ key, delta, id: Date.now() });

    startTransition(async () => {
      const result = await reactAction(yapId, key);
      if (result.ok) {
        setCounts(result.state.counts);
        setMine(result.state.viewerReactions);
        setAura(result.state.aura);
        return;
      }
      setCounts(initialCounts);
      setMine(initialMine);
      setAura(initialAura);
      setPulse(null);
      if (result.error === "AUTH_REQUIRED") {
        setDenied(true);
        setTimeout(() => router.push("/login"), 900);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-stretch gap-y-2">
      {/* People's votes. A chip is a control, so the larger layouts say so
          outright rather than leaving it to a hover state. */}
      {size === "lg" || size === "feature" ? (
        <span className="label mr-3 self-center">
          {signedIn ? "React" : "Sign in to react"}
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {REACTION_KEYS.map((key) => {
          const active = mine.includes(key);
          const meta = REACTION_META[key];
          const pulsing = pulse?.key === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => react(key)}
              title={meta.label}
              aria-pressed={active}
              aria-label={`${meta.label}: ${counts[key]}`}
              className={cn(
                "relative inline-flex items-center border border-ink font-mono tabnums leading-none transition-[background,color,border-color] duration-100",
                CHIP[size],
                active ? "bg-ink text-paper" : "bg-transparent hover:bg-paper-3",
                pulsing && pulse.delta > 0 && "chip-pop",
              )}
            >
              <span className={EMOJI[size]}>{meta.emoji}</span>
              {/* Zero is not information. At this archive's scale most chips sit
                  at nothing, and a row of noughts reads as a broken widget.
                  The slot still takes up its width, though — an emoji rattling
                  around in a narrower box next to its neighbours is what makes
                  an untouched reaction look like a rendering failure rather
                  than an invitation. */}
              <span
                aria-hidden={counts[key] === 0}
                // Keyed on the value so the number visibly ticks over.
                key={counts[key]}
                className={cn(
                  "tick inline-block text-center font-medium",
                  COUNT_SLOT[size],
                  counts[key] === 0 && "opacity-0",
                )}
              >
                {counts[key] > 0 ? counts[key] : 0}
              </span>
              {pulsing ? (
                <span
                  key={pulse.id}
                  className="aura-float pointer-events-none absolute -top-5 left-1/2 z-10 whitespace-nowrap border border-ink bg-acid px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none tracking-[0.04em] text-ink"
                >
                  {pulse.delta > 0 ? `+${pulse.delta}` : pulse.delta} AURA
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Not a sixth button: the standing total the votes add up to. */}
      {showAura ? (
        <div
          className={cn(
            // Below sm the row wraps, so the divider becomes a stray pipe at
            // the start of a line. Drop it and let the gap do the work.
            "flex items-center gap-2",
            "mt-1 w-full sm:mt-0 sm:w-auto sm:border-l sm:border-ink",
            size === "feature" ? "sm:ml-5 sm:pl-5" : "sm:ml-3 sm:pl-3",
          )}
        >
          <span className="label hidden sm:block">Aura</span>
          <span
            key={aura}
            className={cn(
              "mono tabnums font-bold leading-none",
              AURA_NUMBER[size],
              pulse ? "aura-pulse" : "",
              aura >= 0 ? "text-ink" : "text-red",
            )}
          >
            {formatAura(aura)}
          </span>
          <span className="label sm:hidden">Aura</span>
        </div>
      ) : null}

      {denied ? <span className="label ml-3 self-center text-red">sign in to react</span> : null}
    </div>
  );
}
