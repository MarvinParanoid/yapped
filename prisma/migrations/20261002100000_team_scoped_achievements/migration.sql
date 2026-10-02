-- Badges belong to an archive, not to an account.
--
-- They were earned from one team's records and then stored against the global
-- User, keyed only by (userId, key). One person in two archives would carry
-- "1000 AURA" from the first into the second, where they had twelve. Nothing
-- read the table, so nothing leaked — but the model contradicted the rule the
-- whole codebase is built on, and a table nobody reads is exactly the kind that
-- gets read one day by someone who assumes it is right.
--
-- Backfill: a row can be attributed when its owner belongs to exactly one
-- archive, which is every row on this instance. Anything ambiguous is deleted
-- rather than guessed at — the badges are derived from records and are awarded
-- again the next time a profile is opened.
ALTER TABLE "UserAchievement" ADD COLUMN "teamId" TEXT;

UPDATE "UserAchievement" a
   SET "teamId" = m."teamId"
  FROM "Membership" m
 WHERE m."userId" = a."userId"
   AND (SELECT count(*) FROM "Membership" m2 WHERE m2."userId" = a."userId") = 1;

DELETE FROM "UserAchievement" WHERE "teamId" IS NULL;

ALTER TABLE "UserAchievement" ALTER COLUMN "teamId" SET NOT NULL;

DROP INDEX "UserAchievement_userId_key_key";
CREATE UNIQUE INDEX "UserAchievement_teamId_userId_key_key"
    ON "UserAchievement"("teamId", "userId", "key");

ALTER TABLE "UserAchievement"
  ADD CONSTRAINT "UserAchievement_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
