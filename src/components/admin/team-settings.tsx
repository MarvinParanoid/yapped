"use client";

import { useActionState } from "react";
import { createTeamAction, renameTeamAction, type AdminState } from "@/app/actions";

export function RenameTeam({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(renameTeamAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="name" className="label">
          Team name
        </label>
        <input id="name" name="name" defaultValue={name} className="field mt-1.5" />
      </div>
      <button type="submit" disabled={pending} className="btn">
        {pending ? "Saving..." : "Rename"}
      </button>
      {state.error ? <span className="label text-red">{state.error}</span> : null}
      {state.ok ? <span className="label text-acid-deep">{state.ok}</span> : null}
    </form>
  );
}

/** A second archive on the same instance, owned by whoever opens it. */
export function CreateTeam() {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(createTeamAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="newTeam" className="label">
          New team name
        </label>
        <input id="newTeam" name="name" className="field mt-1.5" placeholder="Подливычи 2" />
      </div>
      <button type="submit" disabled={pending} className="btn">
        {pending ? "Opening..." : "Open archive"}
      </button>
      {state.error ? <span className="label text-red">{state.error}</span> : null}
    </form>
  );
}
