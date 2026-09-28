"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { createInviteAction, revokeInviteAction, type AdminState } from "@/app/actions";
import type { InviteRow } from "@/lib/services/invites";
import { cn } from "@/lib/cn";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";

function useCopy(token: string) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const url = `${window.location.origin}/join/${token}`;
    try {
      // navigator.clipboard is undefined outside a secure context, which is
      // where a self-hosted instance lives before TLS.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement("textarea");
        field.value = url;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const ok = document.execCommand("copy");
        field.remove();
        if (!ok) throw new Error("copy refused");
      }
      setState("copied");
      setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("failed");
    }
  }

  return { state, copy };
}

function CopyLink({ token }: { token: string }) {
  const { state, copy } = useCopy(token);
  const d = useD();
  return (
    <button type="button" className="label hover:text-ink" onClick={copy}>
      {state === "copied" ? d.invite.copied : state === "failed" ? d.invite.copyFailed : d.invite.copyLink}
    </button>
  );
}

/**
 * The link that was just minted, shown whole and ready to copy.
 *
 * Without this the new row simply appears somewhere in the list below and you
 * have to find it — which is the one moment you definitely need it.
 */
function FreshLink({ token }: { token: string }) {
  const { state, copy } = useCopy(token);
  const d = useD();
  const [origin, setOrigin] = useState("");

  // The full URL only exists in the browser; rendering it on the server would
  // guess at the host.
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="yap-in mt-3 border border-ink bg-acid px-3 py-2">
      <span className="label-strong">{d.invite.freshHeading}</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <code className="mono break-all text-[13px] font-bold">
          {origin}/join/{token}
        </code>
        <button
          type="button"
          className="label-strong ml-auto shrink-0 underline underline-offset-2 hover:opacity-70"
          onClick={copy}
        >
          {state === "copied" ? `${d.invite.copied} ✓` : state === "failed" ? d.invite.copyFailed : d.invite.copy}
        </button>
      </div>
    </div>
  );
}

export function InviteManager({
  invites,
  showAuthor = false,
}: {
  invites: InviteRow[];
  /** The admin list spans everybody, so it says whose link each one is. */
  showAuthor?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminState, FormData>(
    createInviteAction,
    {},
  );
  const [revoking, startRevoke] = useTransition();
  const d = useD();

  return (
    <div>
      <form action={formAction} className="border-b border-ink px-3 py-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem_auto] sm:items-end">
          <div>
            <label htmlFor="note" className="label">
              {d.invite.note}
            </label>
            <input id="note" name="note" className="field mt-1.5" placeholder={d.invite.notePlaceholder} />
          </div>
          <div>
            <label htmlFor="maxUses" className="label">
              {d.invite.maxUses}
            </label>
            <input
              id="maxUses"
              name="maxUses"
              type="number"
              min={1}
              className="field mt-1.5"
              placeholder="∞"
            />
          </div>
          <div>
            <label htmlFor="expiresInDays" className="label">
              {d.invite.daysValid}
            </label>
            <input
              id="expiresInDays"
              name="expiresInDays"
              type="number"
              min={1}
              className="field mt-1.5"
              placeholder="∞"
            />
          </div>
          <button type="submit" disabled={pending} className="btn btn-acid">
            {pending ? d.invite.minting : d.invite.mint}
          </button>
        </div>
        <p className="label mt-2 leading-[1.5]">
          {d.invite.blankMeans}
        </p>
        {state.error ? (
          <p className="mt-2 border border-red px-3 py-2 font-mono text-[12px] text-red">
            {state.error}
          </p>
        ) : null}
        {state.token ? <FreshLink token={state.token} /> : null}
      </form>

      {invites.length === 0 ? (
        <p className="label px-3 py-4">{d.invite.none}</p>
      ) : (
        <ul>
          {invites.map((invite) => (
            <li
              key={invite.token}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ink px-3 py-2 last:border-b-0",
                invite.deadReason ? "opacity-50" : null,
              )}
            >
              <code className="mono text-[12px] font-bold">/join/{invite.token}</code>
              {invite.note ? <span className="label">{invite.note}</span> : null}
              {showAuthor && invite.createdBy ? (
                <span className="label">{fill(d.invite.by, { name: invite.createdBy })}</span>
              ) : null}
              <span className="label tabnums">
                {invite.maxUses === null
                  ? fill(d.invite.uses, { n: invite.uses })
                  : fill(d.invite.usesOf, { n: invite.uses, max: invite.maxUses })}
              </span>
              {invite.expiresAt ? (
                <span className="label tabnums">
                  {fill(d.invite.until, { date: invite.expiresAt.toISOString().slice(0, 10) })}
                </span>
              ) : null}
              {invite.deadReason ? (
                <span className="label text-red">{d.invite[invite.deadReason]}</span>
              ) : null}

              <span className="ml-auto flex items-center gap-4">
                {invite.deadReason ? null : <CopyLink token={invite.token} />}
                {invite.revokedAt ? null : (
                  <button
                    type="button"
                    disabled={revoking}
                    className="label text-red hover:opacity-70"
                    onClick={() =>
                      startRevoke(async () => {
                        await revokeInviteAction(invite.token);
                        router.refresh();
                      })
                    }
                  >
                    {d.invite.revoke}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
