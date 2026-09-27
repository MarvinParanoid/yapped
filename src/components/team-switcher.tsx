"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { switchTeamAction } from "@/app/actions";

type TeamRef = { id: string; name: string; slug: string };

/**
 * Sits in the nav row's right slot, where the guest notice used to be, so the
 * header keeps exactly the same geometry on every page.
 *
 * With one team it is a label and nothing else — most instances will never see
 * the menu at all.
 */
export function TeamSwitcher({ active, teams }: { active: TeamRef; teams: TeamRef[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // An operator may be looking at an archive that is not one of theirs; listing
  // it alongside their own is how they get back out. One entry is not a menu.
  const options = teams.some((team) => team.id === active.id) ? teams : [active, ...teams];
  if (options.length < 2) {
    return <span className="label shrink-0 truncate">Archive · {active.name}</span>;
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        className="label hover:text-ink"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Archive · {active.name} {open ? "▴" : "▾"}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[200px] border border-ink bg-paper">
          {options.map((team) => (
            <button
              key={team.id}
              type="button"
              disabled={pending}
              className="block w-full border-b border-ink px-3 py-2 text-left text-[13px] font-semibold last:border-b-0 hover:bg-paper-2"
              onClick={() =>
                startTransition(async () => {
                  setOpen(false);
                  if (team.slug === active.slug) return;
                  await switchTeamAction(team.slug);
                  router.refresh();
                })
              }
            >
              {team.name}
              {team.slug === active.slug ? <span className="label ml-2">current</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
