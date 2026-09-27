-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'CLOSED', 'COLD');
-- CreateTable
CREATE TABLE "Case" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CaseYap" (
    "caseId" INTEGER NOT NULL,
    "yapId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CaseYap_pkey" PRIMARY KEY ("caseId","yapId")
);
-- CreateIndex
CREATE INDEX "Case_status_openedAt_idx" ON "Case"("status", "openedAt");
-- CreateIndex
CREATE INDEX "CaseYap_yapId_idx" ON "CaseYap"("yapId");
-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CaseYap" ADD CONSTRAINT "CaseYap_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CaseYap" ADD CONSTRAINT "CaseYap_yapId_fkey" FOREIGN KEY ("yapId") REFERENCES "Yap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
