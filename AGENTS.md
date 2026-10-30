<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Editorial voice — meme-bureaucratic

Yapped reads as though a government department found corporate brainrot, placed
it under state registration, and built an information system to document it.
**The system never acknowledges the joke.** It files, numbers, corroborates and
ranks with a straight face, and lets the reader notice.

The motto of the editorial policy: *«Сказал по приколу. Приобщили всерьёз».*

## Three ingredients

**Officialese.** The vocabulary of records management, investigation files and
financial regulation: фигурант, показания, приобщено, установленный факт,
реестр, на учёте. In English: on the record, entered into the register, filed,
corroborated, balance sheet.

**Meme.** Internet vocabulary used as if it were approved terminology — аура,
кринж, лор, brainrot, Elo. Never dropped in at random; it has to sit inside the
administrative sentence as though nobody finds it unusual.

**Disproportion.** The humour is the gap between how small the event is and how
seriously the institution treats it. "No witnesses" becomes «Свидетели не
установлены. Все внезапно отошли.»

## Three intensities

**Level 0 — functional.** Buttons, fields, confirmations, destructive actions,
errors. Clarity beats voice, every time. Сохранить. Отмена. Эта сильнее.
An error that jokes about itself is a worse error.

**Level 1 — house style.** Section headings, metric names, statuses, captions.
Фигуранты. Архивариусы. Приобщено к материалам.

**Level 2 — maximum.** Empty states, Wrapped, achievements, rare events. This is
where an institution is allowed to say too much: «ПО ДАННОМУ ЗАПРОСУ КОМПРОМАТ
ОТСУТСТВУЕТ. ПОКА».

**Most copy is Level 0 or 1.** One strong joke per screen is the ceiling. A page
where every label is trying has no contrast left to work with.

## Russian and English

Two independently authored voices, not translations of each other. Russian draws
on state registers, investigation protocols and post-irony; English on corporate
compliance, legal discovery and terminally online humour. Meaning, function and
intensity match — the jokes do not have to. Never translate a Russian
bureaucratic idiom word for word if it reads as nothing in English.

Russian must never need to know anyone's gender: no `сказал(а)`, no `внёс(ла)`,
no masculine possessives for a member. Prefer a label with no verb to agree
(`автор: {name}`) over a sentence that has to choose.

## Terminology, kept exact

оратор / yapper · архивариус / archivist · цитата, запись / yap, record ·
свидетель / witness · показания / testimony · оспаривание / dispute ·
предыстория / lore · улика / evidence · аура / aura · Elo.

Aura and Elo are different numbers and are never used for one another. A record
is not called confirmed unless the data says so; certification is its own state,
not a synonym for "has witnesses". **Never trade semantic accuracy for a line.**

## Never translated

Quotes, people's names, lore, witness statements — anything a person typed.
These are the archive's materials; their original wording is the point.

## Good and bad

Good: «К сожалению, это было сказано.» · «Нехарактерно профессиональный месяц.»
· «Архив ненадолго захлебнулся. Это зафиксировано.» · `WHO YAPPED HARDER?` ·
`THE INTERNET FORGETS. WE DON'T.`

Bad: generic SaaS phrasing · memes with no administrative frame · police
vocabulary on every button · a long joke inside a form · emoji · anything
unkind about a real colleague. The record is the target of the joke, never the
person.

All interface text lives in `src/lib/i18n`. `tests/unit/surfaces.test.ts` fails
the build when a string is written into the markup instead — it checks text
nodes, props, ternaries, template literals and text mixed with expressions,
because copy has hidden in all five.
