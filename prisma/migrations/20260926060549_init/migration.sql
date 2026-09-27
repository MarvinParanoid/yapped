-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "YapStatus" AS ENUM ('ARCHIVED', 'CERTIFIED', 'REDACTED');

-- CreateEnum
CREATE TYPE "Classification" AS ENUM ('ROUTINE', 'QUESTIONABLE', 'UNHINGED', 'CLASSIFIED');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('BASED', 'DEAD', 'REAL', 'CRINGE', 'STONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "title" TEXT,
    "bio" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Yap" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "lore" TEXT,
    "saidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "status" "YapStatus" NOT NULL DEFAULT 'ARCHIVED',
    "classification" "Classification" NOT NULL DEFAULT 'QUESTIONABLE',
    "aura" INTEGER NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "eloRating" INTEGER NOT NULL DEFAULT 1500,
    "battleWins" INTEGER NOT NULL DEFAULT 0,
    "battleLosses" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "submittedById" TEXT,

    CONSTRAINT "Yap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL,
    "yapId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YapTag" (
    "yapId" INTEGER NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "YapTag_pkey" PRIMARY KEY ("yapId","tagId")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "yapId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Battle" (
    "id" TEXT NOT NULL,
    "winnerId" INTEGER NOT NULL,
    "loserId" INTEGER NOT NULL,
    "voterId" TEXT,
    "winnerRatingBefore" INTEGER NOT NULL,
    "loserRatingBefore" INTEGER NOT NULL,
    "ratingDelta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Battle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE INDEX "User_displayName_idx" ON "User"("displayName");

-- CreateIndex
CREATE INDEX "Yap_deletedAt_createdAt_idx" ON "Yap"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Yap_deletedAt_aura_idx" ON "Yap"("deletedAt", "aura");

-- CreateIndex
CREATE INDEX "Yap_deletedAt_saidAt_idx" ON "Yap"("deletedAt", "saidAt");

-- CreateIndex
CREATE INDEX "Yap_authorId_idx" ON "Yap"("authorId");

-- CreateIndex
CREATE INDEX "Yap_eloRating_idx" ON "Yap"("eloRating");

-- CreateIndex
CREATE INDEX "Reaction_yapId_idx" ON "Reaction"("yapId");

-- CreateIndex
CREATE INDEX "Reaction_userId_idx" ON "Reaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_yapId_userId_type_key" ON "Reaction"("yapId", "userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "YapTag_tagId_idx" ON "YapTag"("tagId");

-- CreateIndex
CREATE INDEX "Evidence_yapId_idx" ON "Evidence"("yapId");

-- CreateIndex
CREATE INDEX "Battle_winnerId_idx" ON "Battle"("winnerId");

-- CreateIndex
CREATE INDEX "Battle_loserId_idx" ON "Battle"("loserId");

-- CreateIndex
CREATE INDEX "Battle_createdAt_idx" ON "Battle"("createdAt");

-- CreateIndex
CREATE INDEX "UserAchievement_userId_idx" ON "UserAchievement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_key_key" ON "UserAchievement"("userId", "key");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Yap" ADD CONSTRAINT "Yap_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Yap" ADD CONSTRAINT "Yap_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_yapId_fkey" FOREIGN KEY ("yapId") REFERENCES "Yap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YapTag" ADD CONSTRAINT "YapTag_yapId_fkey" FOREIGN KEY ("yapId") REFERENCES "Yap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YapTag" ADD CONSTRAINT "YapTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_yapId_fkey" FOREIGN KEY ("yapId") REFERENCES "Yap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Yap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "Yap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
