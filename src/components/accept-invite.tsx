"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInviteAction } from "@/app/actions";

/** Signed in already — joining is one button, not another account. */
export function AcceptInvite({
  token,
  teamName,
  userName,
}: {
  token: string;
  teamName: string;
  userName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="border border-ink bg-paper">
      <div className="border-b border-ink px-4 py-3">
        <span className="label-strong">Accept invitation</span>
      </div>
      <div className="px-4 py-5 sm:px-6">
        <p className="text-[14px] leading-[1.6]">
          You are signed in as <span className="font-semibold">{userName}</span>. Accepting adds you
          to {teamName} under the same account.
        </p>

        {error ? (
          <p className="mt-4 border border-red px-3 py-2 font-mono text-[12px] text-red">{error}</p>
        ) : null}

        <button
          type="button"
          disabled={pending}
          className="btn btn-solid btn-lg mt-6 w-full"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await acceptInviteAction(token);
              if (result.ok) {
                router.replace("/");
                router.refresh();
              } else {
                setError(result.error ?? "The archive refused this invitation.");
              }
            })
          }
        >
          {pending ? "Joining..." : `Join ${teamName}`}
        </button>
      </div>
    </div>
  );
}
