"use client";

import { useActionState } from "react";
import { resetPasswordAction, type AuthState } from "@/app/actions";
import { useD } from "@/lib/i18n/client";

/** Two fields and nothing else: the person is here for one reason. */
export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(resetPasswordAction, {});
  const d = useD();

  return (
    <form action={action} className="border border-ink bg-paper px-4 py-5 sm:px-6">
      <input type="hidden" name="token" value={token} />

      <label htmlFor="password" className="label">
        {d.reset.newPassword}
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        className="field mt-1.5"
      />

      <label htmlFor="again" className="label mt-4 block">
        {d.reset.againPassword}
      </label>
      <input
        id="again"
        name="again"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        className="field mt-1.5"
      />

      {state.error ? <p className="label mt-3 text-red">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="btn btn-acid btn-lg mt-6 w-full">
        {pending ? d.reset.saving : d.reset.setIt}
      </button>
    </form>
  );
}
