-- "Contested" as a stored fact rather than one computed twice.
--
-- The rule lives in lib/verification.ts: a record is contested when at least
-- two people deny it and the deniers are at least half as many as the people
-- who confirmed it. Every rendered surface asked that function. Search could
-- not — a Prisma filter has no arithmetic — so it asked a cheaper question,
-- "two or more denials", and returned records the cards, the profile and
-- Wrapped all called uncontested.
ALTER TABLE "Yap" ADD COLUMN "contested" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Yap"
   SET "contested" = ("denialCount" >= 2 AND "denialCount" * 2 >= "witnessCount");
