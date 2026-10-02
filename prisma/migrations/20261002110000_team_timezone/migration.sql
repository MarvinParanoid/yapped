-- The clock an archive keeps.
--
-- Everything is stored as an instant and was being read back with getUTC*, so
-- a team three hours east saw its own "most dangerous hour" named three hours
-- early, and a quote said just after midnight was filed under the day before.
-- UTC is the default because it is what the behaviour already was: existing
-- archives read exactly as they did before anyone picks a zone.
ALTER TABLE "Team" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
