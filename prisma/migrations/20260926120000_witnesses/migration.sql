-- CreateEnum
CREATE TYPE "Verification" AS ENUM ('UNVERIFIED', 'WITNESSED', 'CONFIRMED', 'CERTIFIED');

-- CreateEnum
CREATE TYPE "WitnessStance" AS ENUM ('PRESENT', 'DENIED');

-- AlterEnum
-- Certification moved off the lifecycle enum and onto its own Verification
-- axis. Existing CERTIFIED records become plain ARCHIVED records; their
-- verification is recomputed from witnesses.
BEGIN;
UPDATE "Yap" SET "status" = 'ARCHIVED' WHERE "status" = 'CERTIFIED';
CREATE TYPE "YapStatus_new" AS ENUM ('ARCHIVED', 'REDACTED');
ALTER TABLE "public"."Yap" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Yap" ALTER COLUMN "status" TYPE "YapStatus_new" USING ("status"::text::"YapStatus_new");
ALTER TYPE "YapStatus" RENAME TO "YapStatus_old";
ALTER TYPE "YapStatus_new" RENAME TO "YapStatus";
DROP TYPE "public"."YapStatus_old";
ALTER TABLE "Yap" ALTER COLUMN "status" SET DEFAULT 'ARCHIVED';
COMMIT;

-- AlterTable
ALTER TABLE "Yap" ADD COLUMN     "denialCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verification" "Verification" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "witnessCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Witness" (
    "id" TEXT NOT NULL,
    "stance" "WitnessStance" NOT NULL DEFAULT 'PRESENT',
    "yapId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Witness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Witness_yapId_idx" ON "Witness"("yapId");

-- CreateIndex
CREATE INDEX "Witness_userId_idx" ON "Witness"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Witness_yapId_userId_key" ON "Witness"("yapId", "userId");

-- CreateIndex
CREATE INDEX "Yap_deletedAt_verification_idx" ON "Yap"("deletedAt", "verification");

-- AddForeignKey
ALTER TABLE "Witness" ADD CONSTRAINT "Witness_yapId_fkey" FOREIGN KEY ("yapId") REFERENCES "Yap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Witness" ADD CONSTRAINT "Witness_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

