-- One verdict per person per pair.
--
-- Changing your mind about which of two statements yapped harder is allowed.
-- Voting for the same one forty times is not the same thing, and until now the
-- arena could not tell them apart: every vote appended a row and moved Elo
-- again. That was not only reachable by a crafted request — getBattlePair's
-- sampling fallback hands back an already-judged pair when it cannot find a
-- fresh one, so real archives have been re-voting by accident. This one had 23
-- battles standing for 17 actual verdicts.
--
-- So the pair becomes part of the row's identity, and a later verdict replaces
-- the earlier one instead of stacking on top of it.

ALTER TABLE "Battle" ADD COLUMN "pairLowId" INTEGER;
ALTER TABLE "Battle" ADD COLUMN "pairHighId" INTEGER;

UPDATE "Battle"
   SET "pairLowId"  = LEAST("winnerId", "loserId"),
       "pairHighId" = GREATEST("winnerId", "loserId");

-- Collapse the history to the verdict each person is standing by: the most
-- recent one. Anonymous rows (voterId IS NULL) are left alone — they are not
-- attributable to a person, so "the same person voting twice" does not apply.
DELETE FROM "Battle" b
 USING "Battle" newer
 WHERE b."voterId" IS NOT NULL
   AND b."teamId"     = newer."teamId"
   AND b."voterId"    = newer."voterId"
   AND b."pairLowId"  = newer."pairLowId"
   AND b."pairHighId" = newer."pairHighId"
   AND (b."createdAt", b."id") < (newer."createdAt", newer."id");

ALTER TABLE "Battle" ALTER COLUMN "pairLowId"  SET NOT NULL;
ALTER TABLE "Battle" ALTER COLUMN "pairHighId" SET NOT NULL;

CREATE UNIQUE INDEX "Battle_teamId_voterId_pairLowId_pairHighId_key"
    ON "Battle"("teamId", "voterId", "pairLowId", "pairHighId");

-- Yap.eloRating, battleWins and battleLosses are caches of the journal that
-- just changed underneath them, so they are now wrong by exactly the votes
-- removed above. Elo is path-dependent and cannot be un-added in SQL; the
-- repair is a replay, which lives in `npm run recompute:elo`.
