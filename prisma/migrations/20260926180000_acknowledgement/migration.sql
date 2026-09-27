-- AlterTable
ALTER TABLE "Yap" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3);

-- A person cannot be a witness to their own statement: witnessing means
-- independent corroboration. Drop any self-witness rows and recompute the
-- cached tallies and verification from what is left.
DELETE FROM "Witness" w
USING "Yap" y
WHERE w."yapId" = y."id" AND w."userId" = y."authorId";

UPDATE "Yap" y SET
  "witnessCount" = COALESCE(c.present, 0),
  "denialCount"  = COALESCE(c.denied, 0),
  "verification" = CASE
    WHEN COALESCE(c.present, 0) >= 3 THEN 'CERTIFIED'::"Verification"
    WHEN COALESCE(c.present, 0) = 2 THEN 'CONFIRMED'::"Verification"
    WHEN COALESCE(c.present, 0) = 1 THEN 'WITNESSED'::"Verification"
    ELSE 'UNVERIFIED'::"Verification"
  END
FROM (
  SELECT "yapId",
         COUNT(*) FILTER (WHERE "stance" = 'PRESENT') AS present,
         COUNT(*) FILTER (WHERE "stance" = 'DENIED')  AS denied
  FROM "Witness" GROUP BY "yapId"
) c
WHERE y."id" = c."yapId";

UPDATE "Yap" SET "witnessCount" = 0, "denialCount" = 0, "verification" = 'UNVERIFIED'::"Verification"
WHERE "id" NOT IN (SELECT "yapId" FROM "Witness");

-- Filing your own quote is itself an acknowledgement.
UPDATE "Yap" SET "acknowledgedAt" = "createdAt"
WHERE "submittedById" = "authorId" AND "disputedAt" IS NULL;
