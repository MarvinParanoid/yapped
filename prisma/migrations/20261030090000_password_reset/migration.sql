-- A way back in for someone who forgot their password.
--
-- There is no email field anywhere in this archive and nothing that sends mail,
-- so the usual "we have sent you a link" does not exist here. The link is
-- handed over the way an invitation already is: by someone who administers the
-- team, in the chat they are all in. The issuer never sees the new password —
-- the link only lets its holder set one.
CREATE TABLE "PasswordReset" (
    "token"      TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "teamId"     TEXT NOT NULL,
    "issuedById" TEXT,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "usedAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("token")
);

CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");
-- Spent and expired links are swept whenever one is issued; this is the column
-- that sweep looks at.
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_issuedById_fkey"
  FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
