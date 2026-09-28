"use client";

import { useSyncExternalStore } from "react";

/**
 * The aura figure on a record's page lives in the hero, and the chips that
 * change it live further down — two client components with a server component
 * between them, so no shared React state and no props to pass.
 *
 * A reader put it plainly: "я тыкаю, оно нереактивное". The chips moved, the
 * big number did not, and the page looked broken.
 *
 * This is the smallest thing that joins them: a per-record value the reaction
 * bar writes and the figure reads. Deliberately not context — a provider would
 * have to wrap both, which means restructuring the hero around a state concern.
 */
const values = new Map<number, number>();
const listeners = new Map<number, Set<() => void>>();

export function publishAura(yapId: number, aura: number): void {
  if (values.get(yapId) === aura) return;
  values.set(yapId, aura);
  for (const notify of listeners.get(yapId) ?? []) notify();
}

export function useLiveAura(yapId: number, initial: number): number {
  return useSyncExternalStore(
    (notify) => {
      const set = listeners.get(yapId) ?? new Set();
      set.add(notify);
      listeners.set(yapId, set);
      return () => set.delete(notify);
    },
    () => values.get(yapId) ?? initial,
    // The server has no store; it renders what it was given.
    () => initial,
  );
}
