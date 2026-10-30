<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Editorial voice

Yapped treats trivial workplace statements as matters of permanent
institutional significance. That contrast is the product. **The system never
acknowledges the joke** — it files, numbers, corroborates and ranks, with a
straight face, and lets the reader notice.

1. Deadpan bureaucracy beats a punchline. The humour is in the disproportion,
   not in the wording trying to be funny.
2. **One strong joke per screen, at most.** A page where every label is making
   an effort has no contrast left to work with.
3. **Most copy should not be funny at all.** Errors, buttons, form labels and
   navigation are infrastructure: clear and predictable. An error that jokes
   about itself is a worse error.
4. Short beats elaborate. A long joke in a form is a long form.
5. Never trade semantic accuracy, accessibility or safety for a line. The
   archive distinguishes the author of a statement, whoever filed it, a witness,
   whoever disputes it, and whoever administers the archive — those stay exact.
6. Descriptions attach to records, never to colleagues. Mocking the statement is
   the premise; mocking the person is not.
7. No emoji, no winking, no explaining the joke.

**English and Russian are authored separately.** Neither is a translation of the
other, and some asymmetry is deliberate. The Russian rule — archival, civil
service and police-file register, and the vocabulary it settled on — is written
at the top of `src/lib/i18n/ru.ts`, next to the strings it governs.

Russian must also never need to know anyone's gender: no `сказал(а)`, no
`внёс(ла)`, no masculine possessives for a member. Prefer a short label with no
verb agreement (`автор: {name}`) over a sentence that has to choose.

Established product terms stay as they are, in both languages: yap, yapper,
aura, lore, evidence, Elo, battle, BASED.

All interface text lives in `src/lib/i18n`. `tests/unit/surfaces.test.ts` fails
the build when a string is written into the markup instead — it checks text
nodes, props, ternaries and template literals, because copy has hidden in all
four.
