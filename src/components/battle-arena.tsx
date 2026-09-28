"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { battleVoteAction } from "@/app/actions";
import { QuoteText } from "@/components/quote-text";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";
import { formatDate } from "@/lib/format";
import type { YapView } from "@/lib/types";

export function BattleArena({
  left,
  right,
  signedIn,
  rounds = 10,
}: {
  left: YapView;
  right: YapView;
  signedIn: boolean;
  rounds?: number;
}) {
  const d = useD();
  const months = d.profile.months.split(" ");
  const ROUNDS = rounds;
  const router = useRouter();
  const [round, setRound] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const [upset, setUpset] = useState<{ gap: number; delta: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(winner: YapView, loser: YapView) {
    if (!signedIn) {
      router.push("/login?next=/battle");
      return;
    }
    if (pending) return;
    setPicked(winner.id);
    startTransition(async () => {
      const result = await battleVoteAction(winner.id, loser.id);
      // An underdog win is worth announcing; everything else is silent.
      setUpset(
        result.upset && result.delta !== undefined && result.gap !== undefined
          ? { gap: result.gap, delta: result.delta }
          : null,
      );
      setRound((value) => (value % ROUNDS) + 1);
      setPicked(null);
      // A navigation, not a soft refresh: the next pair must be guaranteed,
      // and it should not be the one just judged.
      router.replace(
        `/battle?n=${Date.now().toString(36)}&not=${left.id},${right.id}`,
        { scroll: false },
      );
    });
  }

  function skip() {
    startTransition(() => {
      setRound((value) => (value % ROUNDS) + 1);
      router.replace(
        `/battle?n=${Date.now().toString(36)}&not=${left.id},${right.id}`,
        { scroll: false },
      );
    });
  }

  const card = (yap: YapView, opponent: YapView, side: "left" | "right") => (
    <div
      className={cn(
        "flex flex-col border border-ink bg-paper transition-colors duration-100",
        picked === yap.id && "bg-acid",
        pending && picked !== yap.id && "opacity-50",
      )}
    >
      <div className="flex items-center gap-3 border-b border-ink px-3 py-2">
        <span className="label">{side === "left" ? d.sections.contenderA : d.sections.contenderB}</span>
        <Link href={`/yap/${yap.id}`} className="mono ml-auto text-[11px] text-muted hover:text-ink">
          {yap.code}
        </Link>
      </div>

      <div className="flex flex-1 flex-col px-4 py-5 sm:px-5 sm:py-6">
        <QuoteText text={yap.text} scale="battle" />
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-2 text-[13px] font-bold">
            <Avatar name={yap.author.displayName} src={yap.author.avatarUrl} size={20} />—{" "}
            {yap.author.displayName}
          </span>
          <span className="label">{formatDate(yap.saidAt, months)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="mono text-[11px] text-muted">🔥 {yap.counts.BASED}</span>
          <span className="mono text-[11px] text-muted">💀 {yap.counts.DEAD}</span>
          <span className="mono text-[11px] text-muted">😭 {yap.counts.REAL}</span>
          <span className="mono ml-auto text-[11px] text-muted">
            {d.sections.elo.toLowerCase()} {yap.eloRating}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => choose(yap, opponent)}
        disabled={pending}
        className="btn btn-solid w-full border-x-0 border-b-0 py-3.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {signedIn ? d.sections.thisOneWins : d.sections.signInToVote}
      </button>
    </div>
  );

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch md:gap-0">
        {card(left, right, "left")}

        <div className="flex items-center justify-center md:w-16">
          <span className="wordmark bg-acid px-3 py-1 text-[26px] md:rotate-[-4deg]">VS</span>
        </div>

        {card(right, left, "right")}
      </div>

      {upset ? (
        <div className="yap-in mt-4 flex flex-wrap items-center justify-center gap-3 border border-ink bg-acid px-4 py-2">
          <span className="label-strong">{d.sections.upset}</span>
          <span className="mono text-[12px]">
            {fill(d.sections.upsetBody, { gap: upset.gap, delta: upset.delta })}
          </span>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col items-center gap-4">
        <div className="h-1.5 w-full max-w-[420px] border border-ink">
          <div
            className="h-full bg-ink transition-[width] duration-200"
            style={{ width: `${(round / ROUNDS) * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-6">
          <span className="label">
            battle {round} / {ROUNDS}
          </span>
          <button type="button" onClick={skip} className="btn" disabled={pending}>
            Skip →
          </button>
        </div>
        {!signedIn ? (
          <p className="label text-red">
            <Link href="/login" className="underline underline-offset-2">
              sign in
            </Link>{" "}
            to cast a vote
          </p>
        ) : null}
      </div>
    </div>
  );
}
