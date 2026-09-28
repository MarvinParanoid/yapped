/**
 * Battle ratings. Kept apart from aura on purpose: a yap can be beloved and
 * still lose every fight.
 *
 * Pure module. Every vote is journalled in the Battle table, so changing K or
 * the expectation curve here means ratings can be recomputed from history.
 */

export const DEFAULT_RATING = 1500;
export const K_FACTOR = 32;

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export type RatingUpdate = {
  winnerRating: number;
  loserRating: number;
  delta: number;
};

/** One head-to-head result in, two new ratings out. */
export function nextRatings(winnerRating: number, loserRating: number): RatingUpdate {
  const expected = expectedScore(winnerRating, loserRating);
  const delta = Math.round(K_FACTOR * (1 - expected));
  return {
    winnerRating: winnerRating + delta,
    loserRating: loserRating - delta,
    delta,
  };
}

export type LadderEntry = { rating: number; wins: number; losses: number };

/**
 * Replay a whole journal — every figure the arena caches, rebuilt from the
 * results it was cached from.
 *
 * This is what makes the cached columns safe to hold: `eloRating`, `battleWins`
 * and `battleLosses` are a convenience, and the Battle table is the truth. When
 * the two disagree — a changed K factor, or a journal that had duplicate
 * verdicts removed from it — this is how the columns are made to agree again.
 *
 * Order matters: Elo is path-dependent, so the journal must arrive oldest
 * first.
 */
export function replayLadder(
  battles: Array<{ winnerId: number; loserId: number }>,
): Map<number, LadderEntry> {
  const ladder = new Map<number, LadderEntry>();
  const entry = (id: number): LadderEntry => {
    const found = ladder.get(id);
    if (found) return found;
    const fresh = { rating: DEFAULT_RATING, wins: 0, losses: 0 };
    ladder.set(id, fresh);
    return fresh;
  };

  for (const battle of battles) {
    const winner = entry(battle.winnerId);
    const loser = entry(battle.loserId);
    const next = nextRatings(winner.rating, loser.rating);
    winner.rating = next.winnerRating;
    loser.rating = next.loserRating;
    winner.wins += 1;
    loser.losses += 1;
  }
  return ladder;
}

/** Ratings alone, for callers that do not care about the win column. */
export function replay(
  battles: Array<{ winnerId: number; loserId: number }>,
): Map<number, number> {
  return new Map(
    [...replayLadder(battles)].map(([id, entry]) => [id, entry.rating]),
  );
}

export function winRate(wins: number, losses: number): number | null {
  const total = wins + losses;
  if (total === 0) return null;
  return wins / total;
}
