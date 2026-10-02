"use client";

import { useActionState } from "react";
import { useEffect, useState } from "react";
import {
  createTeamAction,
  renameTeamAction,
  setTeamTimezoneAction,
  type AdminState,
} from "@/app/actions";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";

export function RenameTeam({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(renameTeamAction, {});
  const d = useD();

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="name" className="label">
          {d.admin.teamName}
        </label>
        <input id="name" name="name" defaultValue={name} className="field mt-1.5" />
      </div>
      <button type="submit" disabled={pending} className="btn">
        {pending ? d.admin.saving : d.admin.rename}
      </button>
      {state.error ? <span className="label text-red">{state.error}</span> : null}
      {state.ok ? <span className="label text-acid-deep">{state.ok}</span> : null}
    </form>
  );
}

/**
 * The clock the archive keeps.
 *
 * One zone for the whole team rather than one per reader, because an archive
 * is kept by people who were in the same room: "the most dangerous hour" is a
 * fact about that room, and it would be a different fact for everyone if each
 * reader saw their own. Everything is still stored as an instant; this only
 * decides how those instants are read back.
 */
export function TeamTimezone({ timezone }: { timezone: string }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(
    setTeamTimezoneAction,
    {},
  );
  const [detected, setDetected] = useState<string | null>(null);
  const d = useD();

  // Only as a suggestion — whoever administers the archive may not be sitting
  // in the zone it keeps.
  useEffect(() => {
    try {
      setDetected(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setDetected(null);
    }
  }, []);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="timezone" className="label">
          {d.admin.timezone}
        </label>
        <input
          id="timezone"
          name="timezone"
          defaultValue={timezone}
          list="known-zones"
          className="field mt-1.5"
          placeholder="Europe/Moscow"
        />
        <datalist id="known-zones">
          {detected ? <option value={detected} /> : null}
          <option value="UTC" />
          <option value="Europe/Moscow" />
          <option value="Europe/Belgrade" />
          <option value="Europe/Lisbon" />
          <option value="Asia/Tbilisi" />
          <option value="Asia/Yerevan" />
          <option value="Asia/Almaty" />
        </datalist>
        {detected && detected !== timezone ? (
          <p className="label mt-1.5">{fill(d.admin.yourClock, { zone: detected })}</p>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className="btn">
        {pending ? d.admin.saving : d.admin.save}
      </button>
      {state.error ? <span className="label text-red">{state.error}</span> : null}
      {state.ok ? <span className="label text-acid-deep">{state.ok}</span> : null}
    </form>
  );
}

/** A second archive on the same instance, owned by whoever opens it. */
export function CreateTeam() {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(createTeamAction, {});
  const d = useD();

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="newTeam" className="label">
          {d.admin.newTeamName}
        </label>
        <input id="newTeam" name="name" className="field mt-1.5" placeholder="Подливычи 2" />
      </div>
      <button type="submit" disabled={pending} className="btn">
        {pending ? d.admin.opening : d.admin.openArchive}
      </button>
      {state.error ? <span className="label text-red">{state.error}</span> : null}
    </form>
  );
}
