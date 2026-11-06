-- Two things the archive could not say before.
--
-- A weekly ruling, and whether a person still works here.

-- Personnel status. It belongs to the membership rather than to the account
-- because it is a fact about one organisation: the same person can be current
-- in one archive and former in another, exactly as their badges already are.
-- CURRENT is the default in the technical sense only — it means nothing has
-- been recorded, not that employment has been confirmed.
CREATE TYPE "Employment" AS ENUM ('CURRENT', 'FORMER');

ALTER TABLE "Membership"
  ADD COLUMN "employment" "Employment" NOT NULL DEFAULT 'CURRENT';

-- What the committee decided about one ISO week.
--
-- A week is examined the first time anybody asks about it after it has closed,
-- and the answer then stands: late reactions, a quote filed afterwards, a
-- corrected date or a redaction do not reopen a published decision. A week in
-- which nothing was said is stored as a row with no winner, not as a missing
-- row, so "nobody" is itself a finding rather than an absence of one.
CREATE TABLE "WeeklyRuling" (
    "id"          TEXT NOT NULL,
    "teamId"      TEXT NOT NULL,
    "isoYear"     INTEGER NOT NULL,
    "isoWeek"     INTEGER NOT NULL,
    "periodFrom"  TIMESTAMP(3) NOT NULL,
    "periodTo"    TIMESTAMP(3) NOT NULL,
    "winnerId"    TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "aura"        INTEGER NOT NULL DEFAULT 0,
    "decidedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyRuling_pkey" PRIMARY KEY ("id")
);

-- One ruling per week per archive. Two readers arriving at the same moment
-- both compute the same verdict; this is what makes the second one a no-op
-- instead of a second opinion.
CREATE UNIQUE INDEX "WeeklyRuling_teamId_isoYear_isoWeek_key"
  ON "WeeklyRuling"("teamId", "isoYear", "isoWeek");
-- Counting someone's titles on their profile.
CREATE INDEX "WeeklyRuling_teamId_winnerId_idx" ON "WeeklyRuling"("teamId", "winnerId");

ALTER TABLE "WeeklyRuling" ADD CONSTRAINT "WeeklyRuling_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Cascade, like reactions and badges: a person removed from the instance takes
-- what the archive attributed to them with them.
ALTER TABLE "WeeklyRuling" ADD CONSTRAINT "WeeklyRuling_winnerId_fkey"
  FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
