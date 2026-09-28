"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acknowledgeAction,
  disputeAction,
  withdrawAcknowledgementAction,
  witnessAction,
} from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";
import type { WitnessStance, YapperRef } from "@/lib/types";
import {
  VERIFICATION_LADDER,
  VERIFICATION_RUNG,
  nextRung,
  type Verification,
} from "@/lib/verification";

export type WitnessEntry = { user: YapperRef; stance: WitnessStance };

/**
 * Three independent dimensions, which is exactly the bureaucracy this archive
 * deserves: who said it, who filed it, and who will corroborate it.
 *
 * The author is never a witness — witnessing means independent corroboration —
 * so they get a stronger, separate move: acknowledge the record, or deny it.
 * Acknowledgement never counts toward certification.
 */
export function WitnessPanel({
  yapId,
  authorName,
  authorHasAccount,
  isAuthor,
  acknowledged,
  disputed,
  verification: initialVerification,
  witnessCount: initialWitnesses,
  denialCount: initialDenials,
  stance: initialStance,
  witnesses,
  signedIn,
}: {
  yapId: number;
  authorName: string;
  authorHasAccount: boolean;
  isAuthor: boolean;
  acknowledged: boolean;
  disputed: boolean;
  verification: Verification;
  witnessCount: number;
  denialCount: number;
  stance: WitnessStance | null;
  witnesses: WitnessEntry[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [verification, setVerification] = useState(initialVerification);
  const [count, setCount] = useState(initialWitnesses);
  const d = useD();
  const [denials, setDenials] = useState(initialDenials);
  const [stance, setStance] = useState(initialStance);
  // The author's position is read straight from props: these are infrequent
  // actions, and a local copy would go stale after router.refresh().
  const [denying, setDenying] = useState(false);
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function vote(next: WitnessStance) {
    if (!signedIn) {
      router.push(`/login?next=/yap/${yapId}`);
      return;
    }
    startTransition(async () => {
      const result = await witnessAction(yapId, next);
      if (!result.ok) {
        setError(
          result.error === "AUTHOR_CANNOT_WITNESS"
            ? d.verification.cannotCorroborateOwn
            : d.verification.couldNotRecord,
        );
        return;
      }
      setError(null);
      setVerification(result.state.verification);
      setCount(result.state.witnessCount);
      setDenials(result.state.denialCount);
      setStance(result.state.stance);
      router.refresh();
    });
  }

  const next = nextRung(count);
  const currentRung = VERIFICATION_RUNG[verification];
  const present = witnesses.filter((entry) => entry.stance === "PRESENT");
  const denied = witnesses.filter((entry) => entry.stance === "DENIED");

  return (
    <section className="border border-ink bg-paper">
      <header className="flex items-center justify-between gap-3 border-b border-ink px-3 py-2">
        <span className="label-strong">{d.verification.heading}</span>
        <span className="label">{d.verification.chain}</span>
      </header>

      <ol className="flex items-stretch border-b border-ink">
        {VERIFICATION_LADDER.map((rung, index) => {
          const reached = index <= currentRung;
          const current = index === currentRung;
          return (
            <li
              key={rung}
              className={cn(
                "flex-1 border-r border-ink px-2 py-2 text-center last:border-r-0 transition-colors duration-100",
                current
                  ? "bg-acid font-bold text-ink"
                  : reached
                    ? "bg-ink text-paper"
                    : "bg-transparent text-muted",
              )}
            >
              <span className="block font-mono text-[9px] uppercase leading-none tracking-[0.1em]">
                {d.verification[rung]}
              </span>
              <span className="mono mt-1 block text-[10px] opacity-70">
                {index === 0 ? "0" : `${index}+`}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Dimension one: the person it is about. */}
      <div className="border-b border-ink px-4 py-3">
        <span className="label">{d.verification.author}</span>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {disputed ? (
            <span className="label-strong text-red">✕ {fill(d.verification.deniedBy, { name: authorName })}</span>
          ) : acknowledged ? (
            <span className="label-strong">✓ {fill(d.verification.acknowledgedBy, { name: authorName })}</span>
          ) : authorHasAccount ? (
            <span className="label">{fill(d.verification.authorSilent, { name: authorName })}</span>
          ) : (
            // Not a refusal: there is nobody to press the button.
            <span className="label">{fill(d.verification.noAccountYet, { name: authorName })}</span>
          )}

          {isAuthor && !disputed ? (
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = acknowledged
                      ? await withdrawAcknowledgementAction(yapId)
                      : await acknowledgeAction(yapId);
                    if (result.ok) router.refresh();
                  })
                }
                className={cn("btn", acknowledged && "btn-solid")}
              >
                {acknowledged ? d.verification.takeItBack : d.verification.iSaidThat}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setDenying((value) => !value)}
                className="btn hover:border-red hover:bg-red hover:text-paper"
              >
                {d.verification.iDidNotSayThat}
              </button>
            </div>
          ) : null}
        </div>

        {isAuthor && denying && !disputed ? (
          <div className="yap-in mt-3 border border-red px-3 py-3">
            <label htmlFor="yapper-statement" className="label">
              {d.verification.yapperStatement}
            </label>
            <textarea
              id="yapper-statement"
              rows={2}
              maxLength={400}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              placeholder={d.verification.disputeExample}
              className="field mt-2 resize-none"
            />
            <p className="label mt-2 leading-[1.5] normal-case tracking-normal">
              {d.verification.notRemoved}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await disputeAction(yapId, statement);
                    if (result.ok) {
                      setDenying(false);
                      router.refresh();
                    } else setError(d.verification.couldNotDispute);
                  })
                }
                className="btn border-red bg-red text-paper hover:bg-ink"
              >
                {d.verification.fileDisputeBtn}
              </button>
              <button type="button" className="btn" onClick={() => setDenying(false)}>
                {d.verification.cancel}
              </button>
            </div>
          </div>
        ) : null}
        {acknowledged ? (
          <p className="label mt-2 leading-[1.5] normal-case tracking-normal">
            {d.verification.owningUpNote}
          </p>
        ) : null}
      </div>

      {/* Dimension two: everyone else. */}
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label">{d.verification.witnesses}</span>
          <span className="mono tabnums text-[12px] font-bold">
            {count}
            {denials > 0 ? (
              <span className="text-red"> / {fill(d.verification.denied, { n: denials })}</span>
            ) : null}
          </span>
        </div>

        {present.length > 0 || denied.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {present.map((entry) => (
              <Link
                key={entry.user.id}
                href={`/yapper/${entry.user.id}`}
                className="flex items-center gap-1.5 text-[13px] font-semibold hover:underline"
              >
                <Avatar name={entry.user.displayName} src={entry.user.avatarUrl} size={18} />
                {entry.user.displayName}
              </Link>
            ))}
            {denied.map((entry) => (
              <span
                key={entry.user.id}
                className="flex items-center gap-1.5 text-[13px] text-red line-through"
                title={d.verification.saysNeverHappened}
              >
                {entry.user.displayName}
              </span>
            ))}
          </div>
        ) : (
          <p className="label mt-2">{d.verification.nobodyYet}</p>
        )}

        <p className="label mt-3 leading-[1.6] normal-case tracking-normal">
          {d.verification[`blurb${verification}`]}
          {next
            ? fill(next.needed === 1 ? d.verification.moreNeededOne : d.verification.moreNeededMany, {
                n: next.needed,
                rung: d.verification[next.rung].toLowerCase(),
              })
            : ""}
        </p>

        {isAuthor ? (
          <p className="label mt-3">
            {d.verification.authorCannotWitness}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => vote("PRESENT")}
              disabled={pending}
              aria-pressed={stance === "PRESENT"}
              className={cn("btn", stance === "PRESENT" && "btn-solid")}
            >
              {d.verification.iWasThere}
            </button>
            <button
              type="button"
              onClick={() => vote("DENIED")}
              disabled={pending}
              aria-pressed={stance === "DENIED"}
              className={cn(
                "btn",
                stance === "DENIED"
                  ? "border-red bg-red text-paper hover:bg-red"
                  : "hover:border-red hover:bg-red hover:text-paper",
              )}
            >
              {d.verification.cap}
            </button>
            {!signedIn ? <span className="label">{d.verification.signInToGoOnRecord}</span> : null}
          </div>
        )}

        {error ? <p className="label mt-2 text-red">{error}</p> : null}
      </div>
    </section>
  );
}
