"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchTeamAction } from "@/app/actions";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";

/** Points the team cookie at another archive; every ordinary page follows. */
export function EnterTeam({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const d = useD();

  return (
    <button
      type="button"
      disabled={pending}
      className="label hover:text-ink"
      onClick={() =>
        startTransition(async () => {
          const result = await switchTeamAction(slug);
          if (result.ok) {
            router.push("/admin");
            router.refresh();
          }
        })
      }
    >
      {pending ? d.admin.entering : fill(d.admin.enterTeam, { name })}
    </button>
  );
}
