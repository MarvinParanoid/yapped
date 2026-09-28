"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  loginAction,
  previewClaimAction,
  registerAction,
  type AuthState,
} from "@/app/actions";
import { NAME_MAX } from "@/lib/names";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";
import { formatAura } from "@/lib/ranking/aura";
import type { ClaimPreview } from "@/lib/services/accounts";

export function AuthForm({
  mode,
  next = "/",
  token = "",
  teamName,
}: {
  mode: "login" | "register";
  next?: string;
  /** Register mode only: the invite being redeemed. */
  token?: string;
  teamName?: string;
}) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const [displayName, setDisplayName] = useState("");
  const [claim, setClaim] = useState<ClaimPreview | null>(null);
  const d = useD();

  // Someone may already be quoted under this name without an account. Say what
  // registering would take over, before the spelling is committed to.
  useEffect(() => {
    if (mode !== "register") return;
    const name = displayName.trim();
    if (name.length < 2) {
      setClaim(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await previewClaimAction(name, token);
      if (!cancelled) setClaim(found);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [displayName, mode, token]);

  return (
    <form action={formAction} className="border border-ink bg-paper">
      <div className="border-b border-ink px-4 py-3">
        <span className="label-strong">
          {mode === "login" ? d.auth.signIn : fill(d.join.joinTeam, { team: teamName ?? "" })}
        </span>
      </div>

      <div className="px-4 py-5 sm:px-6">
        <input type="hidden" name="next" value={next} />
        {mode === "register" ? <input type="hidden" name="token" value={token} /> : null}

        {mode === "register" ? (
          <div className="mb-4">
            <label htmlFor="displayName" className="label">
              {d.auth.displayName}
            </label>
            <input
              id="displayName"
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="field mt-2"
              autoComplete="name"
              maxLength={NAME_MAX}
            />
            {claim ? (
              <div
                className={`yap-in mt-2 border border-ink px-3 py-2 ${
                  claim.yapCount > 0 ? "bg-acid" : "bg-paper-2"
                }`}
              >
                <p className="label-strong">
                  {claim.yapCount > 0 ? d.auth.claimingRecord : d.auth.claimingEntry}
                </p>
                <p className="label mt-1.5 leading-[1.5] normal-case tracking-normal">
                  {claim.yapCount > 0 ? (
                    <>
                      {claim.displayName} is already quoted here —{" "}
                      {claim.yapCount} {claim.yapCount === 1 ? "statement" : "statements"} worth{" "}
                      {formatAura(claim.totalAura)} aura. Registering under this name takes them
                      over.
                    </>
                  ) : (
                    <>
                      {claim.displayName} is already on file without an account, but has said
                      nothing on record yet. Registering takes over that entry instead of creating
                      a second person.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <p className="label mt-1">{d.auth.claimPrefix}</p>
            )}
          </div>
        ) : null}

        <div className="mb-4">
          <label htmlFor="username" className="label">
            {d.auth.username}
          </label>
          <input
            id="username"
            name="username"
            required
            className="field mt-2"
            autoComplete="username"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            {d.auth.password}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="field mt-2"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        {state.error ? (
          <p className="mt-4 border border-red px-3 py-2 font-mono text-[12px] text-red">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn btn-solid btn-lg mt-6 w-full">
          {pending ? d.auth.checking : mode === "login" ? d.auth.signIn : d.auth.createAccount}
        </button>

        <p className="label mt-4 text-center">
          {mode === "login" ? (
            <>{d.auth.noAccountHint}</>
          ) : (
            <>
              {d.join.alreadyOnRecord}{" "}
              <Link
                href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
                className="underline underline-offset-2 hover:text-ink"
              >
                {d.join.signInAndJoin}
              </Link>
            </>
          )}
        </p>
      </div>
    </form>
  );
}
