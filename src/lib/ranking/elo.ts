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

/** Replay a whole journal — used if the algorithm is ever changed. */
export function replay(
  battles: Array<{ winnerId: number; loserId: number }>,
): Map<number, number> {
  const ratings = new Map<number, number>();
  const get = (id: number) => ratings.get(id) ?? DEFAULT_RATING;
  for (const battle of battles) {
    const next = nextRatings(get(battle.winnerId), get(battle.loserId));
    ratings.set(battle.winnerId, next.winnerRating);
    ratings.set(battle.loserId, next.loserRating);
  }
  return ratings;
}

export function winRate(wins: number, losses: number): number | null {
  const total = wins + losses;
  if (total === 0) return null;
  return wins / total;
}
