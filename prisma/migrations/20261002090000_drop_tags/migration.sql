-- Tags are withdrawn.
--
-- Same verdict as Cases, from the same people and for the same reason: the
-- feature looked useful on a demo archive and earned nothing on a real one.
-- Six records in, nobody had filtered by a tag, and the box on the submit form
-- was one more thing to fill in before a quote could be filed.
--
-- The team's own words: drop them, and if the archive ever grows big enough to
-- need filtering, decide then with real usage to look at. Search still has
-- free text, from:, by:, aura:, status:, has:, before: and after:.
--
-- Destructive and deliberate: which quote carried which tag is not recoverable
-- from the remaining tables. The records themselves are untouched.
DROP TABLE "YapTag";
DROP TABLE "Tag";
