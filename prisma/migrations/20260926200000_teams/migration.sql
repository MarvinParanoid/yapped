-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
-- DropIndex
DROP INDEX "Battle_createdAt_idx";
-- DropIndex
DROP INDEX "Case_status_openedAt_idx";
-- DropIndex
DROP INDEX "Tag_slug_key";
-- AlterTable
ALTER TABLE "Battle" ADD COLUMN     "teamId" TEXT;
-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "teamId" TEXT;
-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "teamId" TEXT;
-- AlterTable
ALTER TABLE "Yap" ADD COLUMN     "teamId" TEXT;
-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Invite" (
    "token" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT,
    "note" TEXT,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invite_pkey" PRIMARY KEY ("token")
);
-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");
-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
-- CreateIndex
CREATE UNIQUE INDEX "Membership_teamId_userId_key" ON "Membership"("teamId", "userId");
-- CreateIndex
CREATE INDEX "Invite_teamId_idx" ON "Invite"("teamId");
-- CreateIndex
CREATE INDEX "Battle_teamId_createdAt_idx" ON "Battle"("teamId", "createdAt");
-- CreateIndex
CREATE INDEX "Case_teamId_status_openedAt_idx" ON "Case"("teamId", "status", "openedAt");
-- CreateIndex
CREATE INDEX "Tag_teamId_idx" ON "Tag"("teamId");
-- CreateIndex
CREATE UNIQUE INDEX "Tag_teamId_slug_key" ON "Tag"("teamId", "slug");
-- CreateIndex
CREATE INDEX "Yap_teamId_deletedAt_createdAt_idx" ON "Yap"("teamId", "deletedAt", "createdAt");

-- ---------------------------------------------------------------------------
-- Everything that exists today belongs to the founding team. The archive was
-- single-tenant until now, so there is exactly one right answer for every row.
-- ---------------------------------------------------------------------------
INSERT INTO "Team" ("id", "name", "slug", "createdAt")
VALUES ('team_podlivychi', 'Подливычи', 'подливычи', COALESCE((SELECT MIN("createdAt") FROM "User"), CURRENT_TIMESTAMP));

UPDATE "Yap"    SET "teamId" = 'team_podlivychi' WHERE "teamId" IS NULL;
UPDATE "Case"   SET "teamId" = 'team_podlivychi' WHERE "teamId" IS NULL;
UPDATE "Tag"    SET "teamId" = 'team_podlivychi' WHERE "teamId" IS NULL;
UPDATE "Battle" SET "teamId" = 'team_podlivychi' WHERE "teamId" IS NULL;

ALTER TABLE "Yap"    ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "Case"   ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "Tag"    ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "Battle" ALTER COLUMN "teamId" SET NOT NULL;

-- Everyone already on file joins it. The earliest account owns the team; the
-- rest, including people quoted without an account, become members.
INSERT INTO "Membership" ("id", "teamId", "userId", "role", "joinedAt")
SELECT
  'mem_' || "id",
  'team_podlivychi',
  "id",
  CASE
    WHEN "id" = (
      SELECT "id" FROM "User" WHERE "username" IS NOT NULL ORDER BY "createdAt" ASC LIMIT 1
    ) THEN 'OWNER'::"TeamRole"
    WHEN "role" = 'ADMIN' THEN 'ADMIN'::"TeamRole"
    ELSE 'MEMBER'::"TeamRole"
  END,
  "createdAt"
FROM "User";

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Yap" ADD CONSTRAINT "Yap_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
