# yapped. — architecture & design plan

> enterprise-grade yapping infrastructure

This document is the plan the implementation follows: architecture, database schema,
routes, component hierarchy and visual design tokens.

---

## 1. Architecture plan

### 1.1 Shape

A single Next.js (App Router) application talking to one PostgreSQL database through
Prisma. No microservices, no separate API server, no client-side data-fetching library.
Rendering is server-first: pages are React Server Components that call the service layer
directly; mutations are Server Actions. Only genuinely interactive leaves are Client
Components (reaction bar, battle picker, lore toggle, submit form, evidence lightbox).

```
browser
  │  RSC payload / form posts (Server Actions)
  ▼
Next.js app  ──────────────────────────────────────────────┐
  app/            routes, layouts, pages (RSC)             │
  components/     presentation only                        │
  lib/                                                     │
    services/     business logic (the only Prisma callers) │
    ranking/      aura.ts, elo.ts   ← pure, no I/O         │
    storage/      StorageDriver abstraction (local | s3)   │
    auth/         session + password, DB-backed sessions   │
  ▼                                                        │
Prisma Client ──► PostgreSQL                               │
Storage driver ──► ./var/uploads (local) | S3 later ───────┘
```

### 1.2 Boundaries (the rules that keep this pragmatic)

| Layer | Location | Rule |
|---|---|---|
| Database | `prisma/schema.prisma` | Migrations are checked in. Nothing outside `lib/services` and `lib/auth` imports the Prisma client. |
| Business logic | `lib/services/*` | Pure-ish functions over Prisma. Returns plain DTOs (`YapView`, `YapperView`) — never leaks Prisma types into components. **Every read and write takes `teamId` as a required argument** (§1.3c). |
| Tenancy | `lib/auth/team.ts` | The only place a `teamId` is derived from a request. Nothing else reads the team cookie. |
| Ranking | `lib/ranking/aura.ts`, `lib/ranking/elo.ts`, `lib/verification.ts` | **Pure functions, zero imports.** Swapping a formula must not touch UI or services beyond the call site. |
| Image storage | `lib/storage/*` | `StorageDriver` interface (`put`, `get`, `delete`, `url`). `local.ts` implements it against the filesystem; an `s3.ts` can be dropped in behind the same interface and selected by `STORAGE_DRIVER` env. Files never go in the database — only the storage key does. |
| UI | `app/*`, `components/*` | No Prisma, no SQL, no ranking math. Components receive DTOs. |

### 1.3 Aura & battle ratings are isolated on purpose

- `computeAura(counts)` — weighted sum of reaction counts. Weights live in one exported
  constant. Yap.aura is a **denormalized cache** recomputed on every reaction toggle
  (cheap, one aggregate query), so feeds can sort in SQL.
- `trendingScore(aura, ageHours)` — gravity-decayed score, `aura / (hours + 2)^1.5`. Applied
  over a bounded window of the most recent candidates in `listYaps`, so the decay stays in the
  ranking module rather than being duplicated as a SQL expression. If the archive ever outgrows
  the window, this is the one call site to move into SQL.
- `nextRatings(winner, loser)` — plain Elo, K=32, stored on `Yap.eloRating` and journaled
  into the `Battle` table so ratings can be recomputed from history if the algorithm changes.
- `verificationFor(witnesses)` — the UNVERIFIED → WITNESSED → CONFIRMED → CERTIFIED ladder.

### 1.2a Purity is a testability rule, not an aesthetic one

`lib/ranking/*` and `lib/verification.ts` and `lib/search.ts` import nothing. That is what lets
them be tested without a database, and the rule has teeth: momentum classification originally
lived beside the query that feeds it, so importing it opened a Postgres connection — a
component could not use it and a test could not reach it. It now lives in
`lib/ranking/momentum.ts` and the service is a thin query around it.

If a pure function is hard to test, it is in the wrong file.

### 1.3b Three dimensions, never conflated

**who said it** (`authorId`) → **who filed it** (`submittedById`) → **who corroborates it**
(`Witness`). Each answers a different question and none stands in for another:

| Move | Who | Effect |
|---|---|---|
| `I WAS THERE` / `CAP` | anyone **except** the author | the only thing that moves the verification ladder |
| `I SAID THAT` | the author | `acknowledgedAt` — never counts as a witness |
| `I DID NOT SAY THAT` | the author | `disputedAt` + optional statement; clears any acknowledgement |

Acknowledgement cannot be used to inch a record toward CERTIFIED: certification needs three
*independent* witnesses, and the author is structurally excluded from being one. Filing your
own quote sets `acknowledgedAt` at creation — pressing "I said that" about a record you just
typed in would be theatre.

Disputes never delete anything, and witnesses keep their testimony beside the denial:
`DISPUTED BY YAPPER · 4 WITNESSES`.

### 1.3a Aura and verification are different questions

Aura asks *was this good*; verification asks *did this happen*. They are deliberately separate
axes and they are allowed to disagree — the seed contains a 900-aura statement with zero
witnesses, which is the joke working as intended. Certification is therefore **not** an aura
threshold: it is earned when three colleagues put their own name behind "I was there".

Denials (`CAP`) are recorded and displayed but never demote a record or delete it; when they
reach the dispute threshold the card is marked `DISPUTED` and the archive simply keeps the
disagreement.

Reaction weights, gravity and K-factor are the only tunables; all three are exported
constants in the two ranking modules.

### 1.3c Tenancy: a required argument, not a filter

An instance holds one or more **teams**, and a team *is* an archive — records, tags,
battles, leaderboard, Wrapped. Nothing crosses between them.

The enforcement is a type, not a convention: `teamId` is a **required parameter** of every
service function rather than an optional filter on a `where` clause. Forgetting it is a
compile error. Retrofitting teams onto a finished single-tenant app produced ~100 type errors
and zero runtime surprises, which is the entire argument for doing it this way.

`lib/auth/team.ts` is the single place a team id comes from a request. Its `getViewer`
resolves the signed-in user, the teams they belong to, and which one they are currently
looking at (cookie `yapped_team`).

**A required `teamId` proves the query, not the payload.** The compiler can make a service
take a team; it cannot make the *ids* in that call belong to it. Anything a service receives
that names a record or a person has to be checked against the team separately — `createYap`
verifies that both the author and the submitter hold a membership, because the author arrives
from a form field and a tampered submission would otherwise credit a quote to a stranger and
print their name on it. `tests/db/tenant-isolation.test.ts` hands each write path a real id
belonging to another archive and asserts nothing lands.

**The one hole, and why it is visible.** A user with the global role `ADMIN` — the instance
operator, set only by `npm run grant:admin`, never from inside the app — may point that cookie
at *any* archive on the box, including one they are not a member of. Without it, a team that
loses its last owner is unrecoverable. It is never silent: the viewer's role reads `OPERATOR`
instead of a membership, and an acid banner sits under the navigation for as long as they are
inside. `tests/db/teams.test.ts` pins the hole to exactly that size.

Three role questions, kept apart:

| Question | Where | Values |
|---|---|---|
| Do you run this box? | `User.role` | `USER` / `ADMIN` |
| What are you to this team? | `Membership.role` | `OWNER` / `ADMIN` / `MEMBER` |
| What are you to the team you are *looking at*? | `ViewerRole` | the above, plus `OPERATOR` |

### 1.4 Auth (invitation only)

There is no anonymous browsing and no open registration: an archive is closed, and the only
door is a link (`/join/<token>`) someone inside handed out.

That rule is circular on an empty instance — a link needs a team, a team needs a member — so
the very first account is created out of band by `npm run bootstrap`, which refuses to run
once any account exists. Without it a fresh production install is unopenable, which is exactly
what shipped before this was noticed. Any member may mint one — bringing
someone in is not an admin job — with an optional note, use limit and expiry; spending a use is
a conditional `UPDATE`, so two people opening the last seat cannot both take it. A member may
revoke the links they issued; owners, admins and the operator may revoke any.

Voting, reacting and submitting require a session. Credentials are username + password hashed
with `scrypt` (node stdlib, no native dep). Sessions are opaque random tokens stored in a
`Session` row and referenced by an httpOnly cookie, which means magic links can be added
later by writing a `Session` row from an email link with no client changes.

The gate sends people to `/login?next=…` and the form carries that path back, which means
the destination of a successful sign-in arrives from whoever wrote the link. `lib/return-to.ts`
is the allow-list that decides it: one leading slash, no authority, no scheme. Without it the
archive's own login page is a redirector — the address bar says yapped while the password is
typed, and the next screen is somebody else's.

**Where the gate is called matters.** A `loading.tsx` wraps its page in a Suspense boundary,
and Next flushes the shell before the page body runs — so a `redirect()` raised inside such a
page is delivered as an RSC payload on a **200**, with the page already rendered. Segments
with a `loading.tsx` therefore call `requireViewer` from a `layout.tsx`, which renders above
the boundary. `src/proxy.ts` sits in front as a cheap fast path for requests carrying no
session cookie at all; it has no database access, so it cannot recognise an expired one and is
explicitly not the guarantee. `tests/unit/route-gates.test.ts` fails the build if a segment
gains a `loading.tsx` without a gate — this class of bug shipped twice.

**A yapper is not necessarily a user with an account.** Both are `User` rows, but
`passwordHash` is nullable: coworkers exist as quoted-but-accountless yappers and can "claim"
the account later, by registering under exactly the same display name. The claim is scoped to
the team whose invite is being redeemed — two archives may each quote their own Diana, and
neither can claim the other's. Every yap stores `authorId` (who said it) and
`submittedById` (who archived it) separately.

### 1.5 Deployment

Connections are pooled with an explicit ceiling (`DATABASE_POOL_MAX`, default 10) so that
bursts queue instead of being refused. `npx prisma dev` is backed by PGlite and refuses more
than a handful of concurrent clients, so local development sets it to 3.

`docker compose up` → `db` (postgres:17-alpine) + a one-shot `migrate` job + `app` (multi-stage
Dockerfile, Next standalone output). Migrations run in their own container, from a `tools`
stage that carries the Prisma CLI, the migrations and the operator scripts — the runtime image
deliberately carries only what the server needs, and hand-picking pieces of `node_modules` into
it silently misses transitive dependencies.

**CI builds both images; the server pulls them.** The target box has under a gigabyte of RAM
and one core, so building there was the heaviest thing it ever did, and the build cache it
accumulated had the disk at 91%. Each image is tagged with the commit that produced it, so a
deploy, a pin and a rollback all name the same thing. `scripts/deploy.sh` waits for the tag to
appear rather than racing CI, migrates in a one-shot container before touching the app, and
waits on a real healthcheck — a `/login` fetch, which reads the database, so a pass proves both
halves. Compose pins `name: yapped` explicitly: the volumes are prefixed with it, and deriving
it from the directory name means a moved checkout comes up against empty ones.

The Prisma client is created **lazily**: `next build` walks the module graph — including
`/_not-found`, which pulls in the layout and therefore the session — on a machine with no
database. An eager client at import time builds fine locally, where `.env` exists, and fails
only in Docker. Entry point runs `prisma migrate deploy` then optionally seeds.
Uploads live on a named volume mounted at `/app/var/uploads`. Runs comfortably on a 1 GB VPS.

---

## 2. Database schema

```
User ──< Yap (authorId, "said it")
User ──< Yap (submittedById, "archived it")
User ──< Reaction >── Yap
User ──< Session
User ──< UserAchievement
User ──< Battle (voterId)
Yap  ──< Evidence
Yap  ──< YapTag >── Tag
Yap  ──< Battle (winnerId / loserId)
```

### Tables

**Team** — an archive. `id (cuid)`, `name`, `slug @unique`, `createdAt`. `Yap`, `Tag`
and `Battle` each carry a non-null `teamId`; `Tag` is unique on `(teamId, slug)`, so two teams
may both have a `#плесень` and they are different tags.

**Membership** — a person's standing in one archive. `teamId`, `userId`,
`role (OWNER|ADMIN|MEMBER)`, `joinedAt`, `@@unique([teamId, userId])`. A team always keeps at
least one owner; the services refuse the change that would remove the last.

**Invite** — a bearer key. `token (PK)`, `teamId`, `createdById?`, `note?`, `maxUses?`
(null = unlimited), `uses`, `expiresAt?`, `revokedAt?`, `createdAt`. Dead is a computed state,
not a column: revoked, expired or exhausted are distinguished when the link is read, so a
refusal can say which. Spending a use is a conditional `updateMany` on the current `uses`,
which is what makes the last seat safe under a race.

**User** — a person. May or may not have login credentials.
`id (cuid)`, `username? @unique`, `passwordHash?`, `displayName`, `handle? @unique`,
`avatarUrl?`, `title?` ("professional yapper"), `bio?`, `role (USER|ADMIN)`, `createdAt`.

**Yap** — a quote. Integer PK so it can be displayed as `#00420` and routed as `/yap/420`.
`id (autoincrement)`, `text`, `authorId → User`, `submittedById? → User`, `saidAt`
(approximate time the words were uttered), `createdAt` (archived at), `lore?`,
`status (ARCHIVED|REDACTED)` — lifecycle only —
`classification (ROUTINE|QUESTIONABLE|UNHINGED|CLASSIFIED)`,
`verification (UNVERIFIED|WITNESSED|CONFIRMED|CERTIFIED)`, `witnessCount`, `denialCount`,
`aura (Int, cached)`, `reactionCount (Int, cached)`, `viewCount`, `eloRating (Int, default 1500)`,
`battleWins`, `battleLosses`, `deletedAt?`.
Indexes: `(deletedAt, createdAt)`, `(deletedAt, aura)`, `(deletedAt, saidAt)`,
`(deletedAt, verification)`, `authorId`, `eloRating`.

**Battle** — one head-to-head verdict. Carries the ratings that went into it, so the ladder
can be replayed from the journal (`replayLadder` in `lib/ranking/elo.ts`). `pairLowId` /
`pairHighId` are the pair with its order removed, and `@@unique([teamId, voterId, pairLowId,
pairHighId])` is what makes a verdict personal: re-voting is allowed and *replaces* the earlier
result rather than stacking on it. `Yap.eloRating`, `battleWins` and `battleLosses` are caches
of this table; `npm run recompute:elo` rebuilds them when the two disagree.

**Witness** — one colleague going on the record about whether a statement happened.
`id`, `yapId`, `userId`, `stance (PRESENT|DENIED)`, `createdAt`, `@@unique([yapId, userId])`.
A person holds exactly one position per record and may switch it or withdraw it. `witnessCount`
/ `denialCount` / `verification` on `Yap` are caches recomputed from this table. The service
**refuses** a row where `userId = Yap.authorId`, and the migration that introduced the rule
deletes any that already existed and recomputes the tallies.

**Reaction** — one row per (yap, user, type). `@@unique([yapId, userId, type])` enforces
"a user can only give each reaction once"; a second click deletes the row (toggle).
Types: `BASED 🔥 | DEAD 💀 | REAL 😭 | CRINGE 🤡 | STONE 🗿`.

**Tag** — `id`, `slug @unique` (normalized, lowercased, unicode-safe), `label`, `createdAt`.
**YapTag** — join table, `@@id([yapId, tagId])`.

**Evidence** — `id`, `yapId`, `storageKey` (path inside the storage driver, *not* a URL),
`mimeType`, `width?`, `height?`, `caption?`, `position` (so "EVIDENCE #01" is stable),
`createdAt`. Modelled 1-to-many even though the UI attaches at most one, so the schema
does not need a migration to allow a second exhibit.

**Battle** — journal of one head-to-head vote: `id`, `winnerId`, `loserId`, `voterId?`,
`winnerRatingBefore`, `loserRatingBefore`, `ratingDelta`, `createdAt`. Ratings are
reconstructable by replaying this table.

**UserAchievement** — `id`, `userId`, `key (String)`, `awardedAt`, `@@unique([userId, key])`.
The badge *catalog* lives in code (`lib/achievements.ts`) so adding `ANCIENT LORE` is one
array entry plus a predicate over a stats object; the table only records awards.

**Session** — `token @id`, `userId`, `expiresAt`, `createdAt`.

### Seeding: demo is a strategy, not a flag

`prisma/seed.ts` dispatches on `SEED_MODE`:

- **`base`** (default) — `prisma/seed/base.ts`, which deliberately inserts **nothing**. Every
  table the app needs to boot is either a Postgres enum (classifications, verification rungs,
  reaction types) or a code catalog that needs no rows (achievements, titles). A real instance
  starts empty and grows its own lore.
- **`demo`** — `prisma/seed/demo.ts`, the fictional archive.

There is intentionally **no `is_demo` column**. A per-row flag leaks into every query, every
leaderboard, every count and every battle pair; a seed strategy does not leak anywhere. If a
hosted demo is ever wanted, it is a separate database, not a filter.

`seed/demo.ts` refuses to run against a database containing anyone outside its own cast
(`SEED_FORCE=true` overrides), so a stray command cannot overwrite a real archive.

An empty archive is a designed state: the feed renders a first-run panel, the first record is
assigned `#00001`, and `/yappers`, `/battle`, `/random` and the sidebar each have their own copy.

### Seed data
Deterministic (seeded PRNG, identical every run): 14 yappers + 40 reacting colleagues,
46 yaps mixing Russian and English, ~2,980 reactions, ~31,000 aura, 15 certified yaps,
180 battles with spread timestamps, witness statements across all four verification rungs,
formally disputed records with yapper statements, records dated exactly a year back so
`/on-this-day` always demonstrates, generated EVIDENCE images written through the storage
driver, and awarded achievements. Showcase records pin their own corroboration
(`testimony` in the fixture) so that touching the seed anywhere cannot shift the PRNG stream
and drift the flagship record out of CERTIFIED. It is deliberately built to cover **every** UI state, which
makes it the visual regression fixture as much as the demo. `Плесень хайпует.` is deliberately yap **#00420**.

---

## 3. Route / page structure

| Route | Rendering | Purpose |
|---|---|---|
| `/` | dynamic RSC | Feed. `?sort=trending\|fresh\|top` × `?range=today\|week\|month\|all`, `?q=`, `?tag=` |
| `/yap/[id]` | dynamic RSC | Yap detail: quote, lore, evidence, reactions, archival metadata, more from the same yapper |
| `/yap/[id]/share` | dynamic RSC | Preview of the 1200×630 `ShareCard` at exact size — the future OG-image source |
| `/market` | dynamic RSC | YAP INDEX: movers, new listings and dormant records over `?window=` |
| `/on-this-day` | dynamic RSC | The same calendar date in earlier years; `?date=` walks the calendar |
| `/wrapped` | dynamic RSC | Available periods |
| `/wrapped/[year]` · `/wrapped/[year]/[month]` | dynamic RSC | The period report |
| `/yappers` | dynamic RSC | Leaderboard, `?range=` all time / month / week |
| `/yapper/[id]` | dynamic RSC | Profile: stats, badges, tag breakdown, best yap, full history |
| `/random` | dynamic RSC | One fullscreen quote, "GET YAPPED AGAIN" |
| `/battle` | dynamic RSC + action | WHO YAPPED HARDER? two quotes, vote, next pair |
| `/battle/hall` | dynamic RSC | HALL OF YAP — Elo leaderboard |
| `/submit` | RSC + client form | + YAP. Auth required |
| `/invite` | RSC + client form | Mint an invite link. **Any member**; shows only their own links |
| `/admin` | RSC + client controls | One team: invites, members and roles, content moderation, rename. Owners, team admins and the operator |
| `/admin/instance` | RSC + client controls | Every archive on the box, and a way into each. **Operator only** |
| `/join/[token]` | RSC + client form | The invite landing page: register into the team, or join with an existing account |
| `/login` | client form | Minimal credentials screen |
| `/register` | RSC | Says registration is by invitation and points at `/login` |
| `/api/media/[...key]` | route handler | Streams evidence through the storage driver |
| `not-found.tsx` | dynamic | THIS YAP NEVER HAPPENED. |
| `error.tsx` | client | TOO MUCH YAPPING. |
| `(feed)/`, `yappers/`, `battle/`, `random/` → `loading.tsx` | — | RETRIEVING HISTORICAL RECORDS... |

The feed lives in a `(feed)` route group purely so its `loading.tsx` is scoped to `/`.
Loading states are deliberately **not** declared at the app root: a root `loading.tsx` wraps
every page in a Suspense boundary, the shell flushes before the page renders, and `notFound()`
can then only render the 404 page — the response still carries `200`. Routes that can 404
(`/yap/[id]`, `/yapper/[id]`) therefore have no loading file, and return a real 404.

The same flush is why **every segment with a `loading.tsx` carries a `layout.tsx` whose only
job is to call `requireViewer`** — a gate in the page would be delivered on a 200 with the page
already rendered (§1.4). `tests/unit/route-gates.test.ts` enforces the pairing.

Server Actions: `react`, `witness`, `dispute` / `withdrawDispute`,
`submitYap`, `deleteYap`, `restoreYap`, `voteBattle`, `login`, `register`, `logout`,
`acceptInvite`, `switchTeam`, `createInvite`, `revokeInvite`, `setMemberRole`, `removeMember`,
`renameTeam`, `createTeam`.

---

## 4. Component hierarchy

```
RootLayout
├── SiteHeader            wordmark · nav (sections) · search · +YAP · account
│   └── HeaderSearch      collapsed ⌕, expands inline, "/" focuses it
│   └── MobileNav         bottom tab bar on small screens
├── {page}
└── SiteFooter            "the internet forgets. we don't."

/  FeedPage
├── StatTicker            2,481 YAPS ARCHIVED · +182,420 TOTAL AURA · 47 CERTIFIED YAPPERS
├── FeedControls          window control for the current section only (client, URL-state)
└── YapCard[]             ← the workhorse, in three weights (see §5.1)
    ├── YapIdTag          #00420 (mono)
    ├── QuoteText         oversized, size steps down as text grows
    ├── YapByline         — Anna · 24 Sep 2026 · TagList
    ├── ReactionBar       (client) 5 buttons, optimistic, "+1 AURA" float
    └── YapCardMenu       (client, radix Dialog) share / copy / remove-from-record
        └── EvidenceThumb  (optional, right column)

/yap/[id]  YapDetailPage
├── QuoteText (XL) + YapByline + StatusBadge(CERTIFIED)
├── ReactionBar
├── LorePanel             (client) VIEW THE LORE ↓ / HIDE
├── WitnessPanel          (client) the ladder + I WAS THERE / CAP
├── EvidencePanel         EVIDENCE #01 → Lightbox (radix Dialog)
├── TagList
├── ArchivalMeta          SUBMITTED BY · ARCHIVED · CLASSIFICATION · VIEWS (mono grid)
└── RelatedYaps           more from the same mouth

/yappers  YappersPage → RangeTabs + LeaderRow[]
/yapper/[id] YapperDossier → title + rank, four headline figures (yaps / aura / certified /
             disputed), PEAK YAP · BATTLE RECORD · KNOWN ASSOCIATES, FREQUENT VOCABULARY,
             ACHIEVEMENTS, then FROM THE SAME MOUTH
/random   RandomPage → QuoteStage + GetYappedAgain (client) + keyboard ␣/→
/battle   BattlePage → BattleArena (client) → BattleCard ×2 + VersusMark + SkipButton
/submit   SubmitPage → YapForm (client) → QuoteField, YapperSelect, LoreField, TagInput,
                                          EvidenceDrop, SaidAtField → YappedConfirmation
shared: Button, Field, Pill, Tabs, Panel, Dialog, Avatar, EmptyState, Toast(AuraToast)
```

Everything under `components/ui/*` is hand-built brutalist primitives; only the modal
(`Dialog`) leans on a headless Radix primitive, restyled to square, bordered, shadowless.

---

## 5. Visual design tokens

Editorial brutalism + terminal. Black / off-white / one acid accent. No gradients, no
glass, no floating cards, radius ≈ 0.

```css
/* surface */
--paper:      #F2F0E9;   /* off-white base                    */
--paper-2:    #E8E5DC;   /* sunken rows, hover                */
--paper-3:    #DEDACF;   /* sunken chips, inputs              */
--ink:        #0C0C0C;   /* text, borders, dark surfaces      */
--ink-2:      #1B1B19;   /* dark surface elevation            */
--ink-3:      #2E2E2A;   /* avatar tones                      */
--muted:      #6E6B63;   /* metadata                          */
--line:       #0C0C0C;   /* borders are ink at 100%           */
--line-soft:  rgba(12,12,12,.18);

/* accent — used once per view, never decoratively */
--acid:       #D6F84C;   /* certified / active / primary CTA  */
--acid-deep:  #93B312;   /* acid as text on paper (contrast)  */
--red:        #E5341E;   /* cringe, delete, rank #3 flourish  */

/* type */
--font-display: "Golos Text"   — 800/900, uppercase, tracking -0.03em → -0.045em
--font-sans:    "Golos Text"   — 400/500/600 UI
--font-mono:    "JetBrains Mono" — IDs, timestamps, system labels, all-caps 11px/.08em
  (both families carry full Cyrillic — the archive is bilingual by design)

/* quote scale (clamped, drops a step as the quote gets longer) */
--quote-xl: clamp(2.5rem, 7vw, 5.5rem)   /* detail + random   */
--quote-lg: clamp(1.75rem, 4.2vw, 3rem)  /* feed card         */
--quote-md: clamp(1.4rem, 3vw, 2rem)     /* battle, related   */

/* structure */
--border:   1px solid var(--ink);
--border-2: 2px solid var(--ink);
--radius:   0;          /* 2px only on pills */
--shadow-hard: 3px 3px 0 var(--ink);   /* used on 2 elements, not everywhere */
--grid-gutter: clamp(16px, 3vw, 40px);

/* motion — fast, never decorative */
--t-fast: 90ms cubic-bezier(.2,0,0,1);
--t-med:  160ms cubic-bezier(.2,0,0,1);
```

Rules of thumb enforced in the UI:
1. The quote is the largest thing on screen, always. Metadata is 11px mono.
2. Borders, not shadows. Hairlines, not cards.
3. Acid accent appears at most twice per viewport.
4. Emoji only inside reaction chips — nowhere else.
5. Dark sections (detail page hero, random) invert to `--ink` ground; the feed stays paper.
6. Deliberate asymmetry: the feed is a 2fr/1fr split, evidence hangs off the right edge,
   the random page's quote is optically off-centre.
7. Jokes are in the *labels*, not the layout. One per screen, maximum.

### 5.1 Card weight and archival markers

The feed must not read as a table, so a record's composition is derived from its own data
(`lib/archival.ts`), never from randomness or position:

| Weight | Earned by | Treatment |
|---|---|---|
| `feature` | top decile of the page's aura **and** verification `CERTIFIED`, max two per page | 5px ledger rail, larger quote, `CERTIFIED YAP` stamp, wider evidence column |
| `compact` | bottom third of aura, no lore, no evidence, not certified | single ledger row: id and quote on one line, meta and votes on the next |
| `standard` | everything else | the default card |

Percentiles are taken over the page being rendered, so the rhythm holds on any dataset.

**Archival markers** (`archivalNote`) put at most one mono label on a card, and only when the
data earns it: `DISPUTED` (two or more colleagues deny it happened) or `EVIDENCE ATTACHED`. That is
roughly one card in eight. Popularity deliberately is **not** a marker — "N witnesses" on every
card is decoration, so witness count lives in the record's metadata on its own page instead.

### 5.2 Votes and aura are different things

Reactions are people speaking; aura is the standing total those voices add up to. They never
share a container: the chips sit together, then a hairline, then the aura block with its own
label. Reacting is a small event — the chip flashes acid, the count ticks over, and the real
weight (`+10 AURA`, not a generic `+1`) rises out of the chip.

### 5.3 Where the accent is allowed

Acid marks one thing per view and is rationed hard: the active sort, the `+ YAP` button, and
the one or two `CERTIFIED YAP` stamps. Certification on ordinary cards is an ink outline, not a
fill, so the stamp keeps its meaning. Images appear only because a statement has evidence —
there is no decorative photography anywhere in the product.

### 3.1 Aura can be reconstructed, not just read

`Reaction.createdAt` means a record's aura at any past moment is recoverable: count the
reactions that existed by that date and run them through the same `computeAura`. On this day
uses it to show what a statement was worth then versus now — a quote can be worth +32 on the
day it was said and +833 a year later, which is the whole point of an archive.

This is why the demo seed backdates reaction and battle timestamps instead of leaving them at
`now()`: without it every date-derived view collapses into "today".

### 3.2 Momentum has no crash, and says so

`lib/services/aura-history.ts` turns the same reconstruction into movement: aura now versus
aura at the start of a window. A record can only ever **gain** aura — replaying surviving
reactions cannot produce a fall — so there is deliberately no "falling" state, because
inventing one would be a lie. The five honest states are:

`NEW` (filed in the last 24h, whatever the window) · `RISING` · `REEMERGING` (quiet for 45+
days, then moved 15%+) · `STEADY` · `DORMANT` (gained nothing while the index moved).

A record filed inside the window has no earlier aura to compare against, so it reports the
absolute gain instead of a meaningless percentage — and counts as RISING, not STEADY.

In the feed the indicator appears **only on Trending**, and only for records that are actually
moving: steady and dormant say nothing, because a badge on every card is noise.

### 4.0 Wrapped is derived, never stored

`lib/services/wrapped.ts` computes a period report entirely from timestamps that already exist
— `Yap.saidAt`, `Battle.createdAt`, the cached aura and witness counts. There is no snapshot
table and no nightly job, so a report is always consistent with the archive as it stands now,
and back-filling a period that predates the feature costs nothing.

A period is the month the yapping **happened in** (`saidAt`), not the month it was typed up.
That is what "September" means to a person looking back.

### 4.1 Lore is the only scale

`Yap.lore` explains one statement, and that turned out to be the whole of it. There was a
second scale — a **case**, grouping several records into a documented episode with a summary,
a status and a chronology. It was withdrawn once the archive held real records: lore already
answers "why does this record exist", and a case number on top of that was ceremony for a
situation that came up about never.

If six quotes from one call ever do need to be read together, that is a shared tag or a "more
from this day" view, not a second domain entity.

### 5.3a Search qualifiers

`lib/search.ts` parses a GitHub-style query — `плесень from:anna aura:>500 has:evidence
status:certified before:2026-10-01` — into a structured filter, and hands anything it
does not recognise back in `unknown` so the UI can say `ignored: …` rather than silently
returning the ordinary feed. Parsing is a pure module; `buildWhere` in `services/yaps.ts` is
the single place that turns a filter into SQL, shared by the listing and the count so the two
can never disagree.

Searching is its own mode: it runs over the whole archive and the window control steps aside,
because a 7-day window silently hiding older matches is a worse answer than no window at all.

### 4.2 Designed for a low-volume archive

Yapped is five to fifteen people and a few statements a week, sometimes none. Mechanics that
assume a constant stream would spend most of their life showing emptiness, so the ones that
depend on time are all tuned for scarcity:

| | |
|---|---|
| Trending | reaches back **60 days** and ranks by decay; no hard window, so it always has something to show |
| Fresh | plain chronology, no window |
| Top | keeps real windows — a historical ranking is allowed to be empty for "today" |
| Wrapped | full report needs **10 records**; below that a short dry entry, and zero gets "either nothing happened or nobody was taking notes" |
| On this day | matches **±7 days**, and says how far off it was ("around this time · 364 days ago") |
| Market | 7d / 30d / 90d windows, defaulting to 30d |
| Verification | 1 / 2 / 3 witnesses — a five-witness bar would certify nothing |

Everything else — Evidence, Battle, Random, Yappers, Hall of Yap — works fine on a
hundred statements gathered over two years, and gets better as the archive ages. That is the
point: this is not a feed to be checked daily, it is a record that becomes funnier with time.

Deliberately **not** built: daily yap, streaks, 24-hour leaderboards, "come back and vote"
notifications. They would advertise a small DAU instead of turning a small archive into the
joke it actually is.

### 5.4 One question per control

The top navigation answers *which section am I in*; the bar under the stats answers *which
window of that section*. They are never allowed to offer the same choice twice, which is why
the sections and the window control have disjoint vocabularies:

| Section | Window | Why |
|---|---|---|
| Trending | `24H` · `7D` · `30D` | "what is moving now" has no all-time |
| Top | `Today` · `This week` · `This month` · `All time` | a historical ranking by aura |
| Fresh | none | ordered by arrival; a window would say nothing |

Search is an action rather than a filter, so it lives in the header as a collapsed `⌕` (and on
the `/` key) instead of competing with the window control. An active search or tag renders as
one inverted banner above the feed with a record count and a clear.

### 5.5 A control must look like a control

Browsers render `<button>` with an arrow cursor by default, and only `.btn` set
`cursor: pointer` — so reaction chips, window switches and toggles read as static numbers and
felt broken. `button:not(:disabled), summary, [role="button"]` now carry the pointer globally.

Two related rules learned the same way:

- **Never fake success for a guest.** Reacting while signed out used to bump the count,
  roll it back and then navigate away a second later. It now goes straight to
  `/login?next=…` and comes back. A disabled-looking button that does nothing is worse than
  no button: the battle vote says `SIGN IN TO VOTE` instead of being greyed out.
- **Prefer a navigation to a soft refresh.** `router.refresh()` changes nothing in the URL, so
  when it does not take there is no signal at all. `/random` and `/battle` now replace the URL
  with a nonce, and `/random` excludes the record currently on screen — drawing the same quote
  twice is indistinguishable from a dead button.

**The test every decision is measured against:** would someone screenshot this and send it
to the group chat?
