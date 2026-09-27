# Tests

Two layers, no browser, no extra runner — `node:test` through `tsx`, both of which the
project already has.

| | |
|---|---|
| `tests/unit` | the pure modules: aura, elo, verification, momentum, search parsing, card emphasis and archival notes — plus two structural checks that read the source tree rather than call it. No database, runs anywhere in ~100ms. |
| `tests/db` | the rules that live half in TypeScript and half in the schema: who may witness what, acknowledgement versus dispute, aura recomputation, pagination, search qualifiers reaching SQL, case ordering, and the wall between teams. |

```bash
npm run test:unit          # always works

npx prisma dev --name yapped-test          # a database to throw away
export TEST_DATABASE_URL="postgres://…"    # the URL it prints
npx prisma migrate deploy                  # once, against that URL
npm run test:db

npm test                   # both
```

`tests/db` **truncates every table**, so it refuses to run unless `TEST_DATABASE_URL` is set
*and* `DATABASE_URL` points at the same database. It will never touch an archive by accident.
They also run with `--test-concurrency=1`: the files share one database and each resets it, so
running them in parallel makes them wipe each other mid-test.

## What these protect

Every test here exists because the behaviour it covers was either broken during development
or is a rule that was argued about and settled:

- the author of a statement can never be one of its witnesses, and acknowledging it does not
  move the verification ladder;
- acknowledgement and dispute are mutually exclusive, and filing your own quote acknowledges it;
- a record that earned all of its aura inside the window is *rising*, not steady — this one
  shipped broken once;
- an unrecognised search qualifier is reported, not silently dropped;
- **every route segment with a `loading.tsx` gates access in a `layout.tsx`**, because a
  page-level `redirect()` under a Suspense boundary is delivered on a 200 with the shell
  already rendered. This shipped broken twice — first as 404s returning 200, then as the auth
  gate letting a stale session cookie see a rendered page — so it is now a test, not a habit;
- the cookie name `src/proxy.ts` checks is the one `createSession` actually writes; the proxy
  duplicates it deliberately to stay free of database-touching modules;
- pagination covers every record exactly once, with no overlap;
- case members are ordered by when things were said, not when they were filed;
- naming a new yapper creates a person with no credentials, and registering under exactly that
  name claims their statements — while a different spelling deliberately starts a separate
  person;
- **no read or write crosses between teams**: the feed, a record fetched by id, reactions,
  leaderboards, profiles, tags, cases and the arena are each checked against a second archive
  holding a namesake and a higher-aura record. `tests/db/teams.test.ts` is the file to extend
  whenever a service grows a new query;
- an invite link admits exactly as many people as it says, and two people racing for the last
  seat produce one member, not two — the conditional update, tested concurrently;
- a revoked, expired or exhausted link reports *which* of the three it is, because "invalid
  link" is a useless thing to be told;
- a team always keeps an owner: the last one can neither step down nor be removed;
- the instance operator (`User.role = ADMIN`) can moderate a team they never joined, and an
  ordinary member of another team cannot — the one deliberate hole in the wall, pinned so it
  stays exactly that size;
- any member may hand out an invite, but may only pull back the links they handed out —
  revocation without that constraint is the owner's and admin's power.
