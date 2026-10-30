"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { issueResetAction, removeMemberAction, setMemberRoleAction } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";
import type { TeamRole } from "@/lib/auth/team";
import type { MemberRow } from "@/lib/services/teams";

const ROLES: TeamRole[] = ["OWNER", "ADMIN", "MEMBER"];

export function MemberTable({
  members,
  canManage,
  canReset,
  viewerId,
}: {
  members: MemberRow[];
  canManage: boolean;
  /** Admins may hand someone back into their account; the roster stays the owner's. */
  canReset: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const d = useD();

  return (
    <div>
      {error ? (
        <p className="border-b border-red px-3 py-2 font-mono text-[12px] text-red">{error}</p>
      ) : null}
      <ul>
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink px-3 py-2 last:border-b-0"
          >
            <Avatar name={member.displayName} src={member.avatarUrl} size={26} />
            <Link href={`/yapper/${member.userId}`} className="text-[13px] font-semibold hover:underline">
              {member.displayName}
            </Link>
            {/* A person the archive quotes but who has never signed in is not a
                user yet — worth saying, because they cannot be given a role. */}
            {member.hasAccount ? null : <span className="label">{d.admin.quotedOnly}</span>}
            <span className="label tabnums">
              {fill(d.admin.saidFiled, { said: member.yapCount, filed: member.filedCount })}
            </span>

            {/* Fixed height on both branches so a row with a control and a row
                without one are exactly the same height. */}
            <span className="ml-auto flex h-7 items-center gap-3">
              {canManage && member.hasAccount ? (
                <select
                  className="field h-7 w-auto py-0 text-[12px]"
                  value={member.role}
                  disabled={pending}
                  onChange={(event) =>
                    startTransition(async () => {
                      setError(null);
                      const result = await setMemberRoleAction(
                        member.userId,
                        event.target.value as TeamRole,
                      );
                      if (!result.ok) setError(result.error ?? d.admin.refused);
                      router.refresh();
                    })
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {d.admin[role]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="label">{d.admin[member.role]}</span>
              )}

              {/* Somebody who cannot get in cannot ask for this themselves,
                  so an administrator mints the link and hands it over. The
                  password is set by its holder — never seen here. */}
              {canReset && member.hasAccount ? (
                <button
                  type="button"
                  disabled={pending}
                  className="label hover:text-ink"
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      setLink(null);
                      const result = await issueResetAction(member.userId);
                      if (result.token) {
                        setLink(`${window.location.origin}/reset/${result.token}`);
                      } else {
                        setError(result.error ?? d.admin.refused);
                      }
                    })
                  }
                >
                  {d.admin.resetPassword}
                </button>
              ) : null}

              {canManage && member.userId !== viewerId ? (
                confirming === member.userId ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="label text-red hover:opacity-70"
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        const result = await removeMemberAction(member.userId);
                        if (!result.ok) setError(result.error ?? d.admin.refused);
                        setConfirming(null);
                        router.refresh();
                      })
                    }
                  >
                    {d.admin.reallyRemove}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="label hover:text-red"
                    onClick={() => setConfirming(member.userId)}
                  >
                    {d.admin.remove}
                  </button>
                )
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {link ? (
        <div className="border-t border-ink bg-paper-2 px-3 py-3">
          <p className="label-strong">{d.admin.resetLinkReady}</p>
          <input
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            className="field mono mt-2 text-[12px]"
          />
          <p className="label mt-2 leading-[1.5]">{d.admin.resetLinkNote}</p>
        </div>
      ) : null}

      <p className="label px-3 py-3 leading-[1.5]">
        {d.admin.removalNote}
      </p>
    </div>
  );
}
