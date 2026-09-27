"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeMemberAction, setMemberRoleAction } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import type { TeamRole } from "@/lib/auth/team";
import type { MemberRow } from "@/lib/services/teams";

const ROLES: TeamRole[] = ["OWNER", "ADMIN", "MEMBER"];

export function MemberTable({
  members,
  canManage,
  viewerId,
}: {
  members: MemberRow[];
  canManage: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

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
            {member.hasAccount ? null : <span className="label">quoted only · no account</span>}
            <span className="label tabnums">
              {member.yapCount} said · {member.filedCount} filed
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
                      if (!result.ok) setError(result.error ?? "Refused.");
                      router.refresh();
                    })
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="label">{member.role}</span>
              )}

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
                        if (!result.ok) setError(result.error ?? "Refused.");
                        setConfirming(null);
                        router.refresh();
                      })
                    }
                  >
                    really remove?
                  </button>
                ) : (
                  <button
                    type="button"
                    className="label hover:text-red"
                    onClick={() => setConfirming(member.userId)}
                  >
                    remove
                  </button>
                )
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="label px-3 py-3 leading-[1.5]">
        removing someone revokes their access and ends their sessions. their statements stay on
        record — the archive is what was said, not who is still here.
      </p>
    </div>
  );
}
