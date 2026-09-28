-- Expired sessions are deleted on every sign-in. Without this the sweep is a
-- full scan of the table it is trying to keep small.
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
