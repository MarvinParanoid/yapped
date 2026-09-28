-- Cases are withdrawn.
--
-- The feature grouped several records into one documented episode, and in a
-- real archive it did not earn its weight: the working unit turned out to be a
-- single quote with its lore and its witnesses, and lore alone already answers
-- "why does this record exist". A case number on top of that was ceremony.
--
-- Dropping the tables also removes the only write path that could attach a
-- record from another team, which is the honest way to fix that class of bug.
--
-- Destructive and deliberate: the case titles and groupings are not recoverable
-- from the remaining tables. The records themselves are untouched.
DROP TABLE "CaseYap";
DROP TABLE "Case";
DROP TYPE "CaseStatus";
