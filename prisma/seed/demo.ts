import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { PrismaClient } from "../../src/generated/prisma/client";
import { computeAura, REACTION_KEYS, type ReactionKey } from "../../src/lib/ranking/aura";
import { verificationFor } from "../../src/lib/verification";
import { nextRatings } from "../../src/lib/ranking/elo";
import { buildKey, createLocalDriver } from "../../src/lib/storage/local";
import { hashPassword } from "../../src/lib/auth/password";
import { AUDIENCE, UNCLAIMED_YAPPER, YAPPERS, YAPS, type SeedYap } from "./fixture";

/**
 * The demo archive: a deterministic fictional dataset that deliberately covers
 * every UI state — unverified / witnessed / confirmed / certified, disputed
 * records, formal yapper statements, evidence, lore, high and low aura, and a
 * full battle history. It doubles as the visual regression fixture.
 *
 * Never loaded in production: see prisma/seed.ts.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const storage = createLocalDriver(process.env.STORAGE_LOCAL_DIR ?? "./var/uploads");

/** Deterministic PRNG so every `db:seed` produces the same archive. */
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(420);

const pickMany = <T,>(items: T[], count: number): T[] => {
  const pool = [...items];
  const chosen: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    chosen.push(...pool.splice(Math.floor(random() * pool.length), 1));
  }
  return chosen;
};

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]!,
  );

/** EVIDENCE is generated locally — no network, no binary blobs in the repo. */
async function renderEvidence(evidence: NonNullable<SeedYap["evidence"]>) {
  const width = 900;
  const height = 620;
  const paper = evidence.kind === "chat" ? "#F2F0E9" : "#0C0C0C";
  const ink = evidence.kind === "chat" ? "#0C0C0C" : "#F2F0E9";
  const accent = "#D6F84C";

  const rows = evidence.lines
    .map((line, index) => {
      const y = 150 + index * 72;
      const isMeta = /\d{2}:\d{2}$/.test(line) || /^[A-Z ]+$/.test(line);
      const size = isMeta ? 22 : 38;
      const fill = isMeta ? (evidence.kind === "chat" ? "#6E6B63" : "#8A8A84") : ink;
      const weight = isMeta ? 400 : 700;
      return `<text x="70" y="${y}" font-family="monospace" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${paper}"/>
    <rect x="0" y="0" width="${width}" height="70" fill="${accent}"/>
    <text x="70" y="47" font-family="monospace" font-size="24" font-weight="700" fill="#0C0C0C" letter-spacing="3">EVIDENCE</text>
    ${rows}
    <rect x="0" y="${height - 6}" width="${width}" height="6" fill="${ink}"/>
  </svg>`;

  const { data, info } = await sharp(Buffer.from(svg))
    .webp({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  const key = buildKey(data, "image/webp");
  await storage.put({ key, body: data, mimeType: "image/webp" });
  return { key, width: info.width, height: info.height };
}

export async function seedDemo(): Promise<void> {
  console.log("RETRIEVING HISTORICAL RECORDS...");

  // Order matters: children first.
  await prisma.$transaction([
    prisma.battle.deleteMany(),
    prisma.reaction.deleteMany(),
    prisma.witness.deleteMany(),
    prisma.evidence.deleteMany(),
    prisma.userAchievement.deleteMany(),
    prisma.session.deleteMany(),
    prisma.yap.deleteMany(),
    prisma.invite.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.user.deleteMany(),
    prisma.team.deleteMany(),
  ]);
  // A stable id so the demo archive is byte-for-byte reproducible: the
  // flagship record is always #00420.
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Yap_id_seq" RESTART WITH 420`);

  const demoPassword = await hashPassword("yapped123");

  // The demo archive is one team, like a real one. Everything below is filed
  // under it, so browsing the demo never reaches another team's records.
  const team = await prisma.team.create({
    data: { id: "team_demo", name: "Demo Corp", slug: "demo" },
  });
  const teamId = team.id;

  const yapperIds = new Map<string, string>();
  for (const person of YAPPERS) {
    // On record since some point in the last year and a half.
    const joinedAt = new Date(Date.now() - (120 + random() * 430) * 24 * 60 * 60 * 1000);
    const unclaimed = person.name === UNCLAIMED_YAPPER;
    const user = await prisma.user.create({
      data: {
        createdAt: joinedAt,
        displayName: person.name,
        handle: unclaimed ? null : person.handle,
        title: person.title,
        username: unclaimed ? null : person.handle,
        passwordHash: unclaimed ? null : demoPassword,
        role: person.handle === "dima" ? "ADMIN" : "USER",
        memberships: {
          create: { teamId, role: person.handle === "dima" ? "OWNER" : "MEMBER" },
        },
      },
    });
    yapperIds.set(person.name, user.id);
  }

  const audienceIds: string[] = [];
  for (const name of AUDIENCE) {
    const user = await prisma.user.create({
      data: {
        displayName: name,
        createdAt: new Date(Date.now() - (60 + random() * 500) * 24 * 60 * 60 * 1000),
        memberships: { create: { teamId } },
      },
    });
    audienceIds.push(user.id);
  }
  const everyone = [...yapperIds.values(), ...audienceIds];

  let reactionRows = 0;
  let witnessRows = 0;
  const createdYapIds: number[] = [];

  for (const seed of YAPS) {
    const authorId = yapperIds.get(seed.author);
    if (!authorId) throw new Error(`Unknown yapper: ${seed.author}`);

    const saidAt = new Date(Date.now() - seed.daysAgo * 24 * 60 * 60 * 1000);
    saidAt.setUTCHours(seed.hour, seed.minute, 0, 0);
    // Archived a little after it was said — someone had to type it in.
    const createdAt = new Date(saidAt.getTime() + (20 + random() * 300) * 60 * 1000);

    // Most records are filed by someone else; a few people file their own,
    // which counts as an acknowledgement on its own.
    const selfFiled = random() < 0.18;
    const submitterPool = [...yapperIds.values()].filter((id) => id !== authorId);
    const submittedById = selfFiled
      ? authorId
      : submitterPool[Math.floor(random() * submitterPool.length)];

    const yap = await prisma.yap.create({
      data: {
        teamId,
        text: seed.text,
        lore: seed.lore ?? null,
        saidAt,
        createdAt,
        authorId,
        submittedById,
        classification: seed.classification ?? "QUESTIONABLE",
        // A few records are formally contested by the person they are about.
        disputedAt: seed.dispute
          ? new Date(createdAt.getTime() + 36 * 60 * 60 * 1000)
          : null,
        disputeStatement: seed.dispute?.statement ?? null,
        // Filing your own quote acknowledges it; others own up later, or not.
        acknowledgedAt: seed.dispute
          ? null
          : selfFiled
            ? createdAt
            : random() < 0.3
              ? new Date(createdAt.getTime() + 8 * 60 * 60 * 1000)
              : null,
        viewCount: Math.floor(200 + seed.heat * 2600 + random() * 400),
      },
    });
    createdYapIds.push(yap.id);

    if (seed.evidence) {
      const rendered = await renderEvidence(seed.evidence);
      await prisma.evidence.create({
        data: {
          yapId: yap.id,
          storageKey: rendered.key,
          mimeType: "image/webp",
          width: rendered.width,
          height: rendered.height,
          caption: seed.evidence.caption,
          position: 1,
        },
      });
    }

    // Reactions: the hotter the yap, the more of the office showed up.
    const counts: Record<ReactionKey, number> = {
      BASED: Math.round(everyone.length * seed.heat * (0.45 + random() * 0.35)),
      DEAD: Math.round(everyone.length * seed.heat * (0.25 + random() * 0.3)),
      REAL: Math.round(everyone.length * seed.heat * (0.18 + random() * 0.25)),
      CRINGE: Math.round(everyone.length * (1 - seed.heat) * random() * 0.25),
      STONE: Math.round(everyone.length * seed.heat * (0.1 + random() * 0.22)),
    };

    const data: Array<{
      yapId: number;
      userId: string;
      type: ReactionKey;
      createdAt: Date;
    }> = [];
    for (const type of REACTION_KEYS) {
      for (const userId of pickMany(everyone, counts[type])) {
        // Most reactions land in the days after filing, but a real archive has
        // a long tail: people keep finding old records. Without that tail every
        // older statement would look permanently frozen.
        const burst = random() < 0.65;
        const reactedAt = burst
          ? new Date(createdAt.getTime() + random() * 72 * 60 * 60 * 1000)
          : new Date(
              createdAt.getTime() + random() * Math.max(0, Date.now() - createdAt.getTime()),
            );
        data.push({ yapId: yap.id, userId, type, createdAt: reactedAt });
      }
    }
    if (data.length > 0) {
      await prisma.reaction.createMany({ data, skipDuplicates: true });
      reactionRows += data.length;
    }

    // Witnesses: who will actually admit they were in the room. Correlated
    // with how memorable the moment was, but loosely — some of the loudest
    // statements are ones nobody wants to corroborate.
    // Skewed low on purpose: corroboration should be scarce enough that
    // CERTIFIED still means something.
    const drawnWitnesses = Math.min(
      8,
      Math.max(0, Math.round(seed.heat * 4.6 * Math.pow(random(), 1.5))),
    );
    const drawnDenials = random() < 0.22 ? 1 + Math.floor(random() * 2) : 0;
    // Pinned records always draw first so the rest of the stream stays stable.
    const witnessTarget = seed.testimony?.witnesses ?? drawnWitnesses;
    const denialTarget = seed.testimony ? (seed.testimony.denials ?? 0) : drawnDenials;

    // The author is never a witness to their own statement.
    const bystanders = everyone.filter((id) => id !== authorId);
    const testimony: Array<{ yapId: number; userId: string; stance: "PRESENT" | "DENIED" }> = [];
    for (const userId of pickMany(bystanders, witnessTarget + denialTarget)) {
      testimony.push({
        yapId: yap.id,
        userId,
        stance: testimony.length < witnessTarget ? "PRESENT" : "DENIED",
      });
    }
    if (testimony.length > 0) {
      await prisma.witness.createMany({ data: testimony, skipDuplicates: true });
      witnessRows += testimony.length;
    }

    const witnessCount = testimony.filter((row) => row.stance === "PRESENT").length;
    const denialCount = testimony.length - witnessCount;

    const aura = computeAura(counts);
    await prisma.yap.update({
      where: { id: yap.id },
      data: {
        aura,
        reactionCount: data.length,
        witnessCount,
        denialCount,
        verification: verificationFor(witnessCount),
      },
    });
  }

  // Battles: 180 head-to-heads, decided mostly by aura with room for upsets.
  const contenders = await prisma.yap.findMany({
    select: { id: true, aura: true, eloRating: true },
  });
  const ratings = new Map(contenders.map((yap) => [yap.id, yap.eloRating]));
  const auras = new Map(contenders.map((yap) => [yap.id, yap.aura]));
  const wins = new Map<number, number>();
  const losses = new Map<number, number>();
  const battleRows: Array<{
    teamId: string;
    winnerId: number;
    loserId: number;
    voterId: string;
    pairLowId: number;
    pairHighId: number;
    winnerRatingBefore: number;
    loserRatingBefore: number;
    ratingDelta: number;
    createdAt: Date;
  }> = [];

  const archiveStart = Date.now() - 370 * 24 * 60 * 60 * 1000;
  // One verdict per person per pair, same as the live arena. A demo that
  // violated the constraint would simply fail to seed.
  const cast = new Set<string>();

  for (let i = 0; i < 180; i += 1) {
    const [a, b] = pickMany(contenders, 2);
    if (!a || !b) continue;
    const auraA = auras.get(a.id) ?? 0;
    const auraB = auras.get(b.id) ?? 0;
    const probabilityA = auraA + auraB > 0 ? auraA / (auraA + auraB) : 0.5;
    const aWins = random() < probabilityA * 0.8 + 0.1;
    const winnerId = aWins ? a.id : b.id;
    const loserId = aWins ? b.id : a.id;

    const voterId = everyone[Math.floor(random() * everyone.length)]!;
    const pairLowId = Math.min(a.id, b.id);
    const pairHighId = Math.max(a.id, b.id);
    const verdict = `${voterId}:${pairLowId}:${pairHighId}`;
    if (cast.has(verdict)) continue;
    cast.add(verdict);

    const winnerBefore = ratings.get(winnerId)!;
    const loserBefore = ratings.get(loserId)!;
    const update = nextRatings(winnerBefore, loserBefore);
    ratings.set(winnerId, update.winnerRating);
    ratings.set(loserId, update.loserRating);
    wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
    losses.set(loserId, (losses.get(loserId) ?? 0) + 1);

    battleRows.push({
      teamId,
      winnerId,
      loserId,
      voterId,
      pairLowId,
      pairHighId,
      winnerRatingBefore: winnerBefore,
      loserRatingBefore: loserBefore,
      ratingDelta: update.delta,
      createdAt: new Date(archiveStart + ((i + 1) / 180) * (Date.now() - archiveStart)),
    });
  }

  await prisma.battle.createMany({ data: battleRows });
  for (const [id, rating] of ratings) {
    await prisma.yap.update({
      where: { id },
      data: {
        eloRating: rating,
        battleWins: wins.get(id) ?? 0,
        battleLosses: losses.get(id) ?? 0,
      },
    });
  }

  // Award badges using the same evaluator the profile pages use.
  const { evaluateAchievements } = await import("../../src/lib/achievements");
  for (const [name, userId] of yapperIds) {
    const authored = await prisma.yap.findMany({
      where: { authorId: userId, deletedAt: null },
      select: { aura: true, verification: true, battleWins: true, lore: true, saidAt: true },
    });
    if (authored.length === 0) continue;
    const totalAura = authored.reduce((sum, yap) => sum + yap.aura, 0);
    const badges = evaluateAchievements({
      yapCount: authored.length,
      totalAura,
      certifiedCount: authored.filter((yap) => yap.verification === "CERTIFIED").length,
      bestYapAura: Math.max(...authored.map((yap) => yap.aura)),
      battleWins: authored.reduce((sum, yap) => sum + yap.battleWins, 0),
      hasLore: authored.some((yap) => yap.lore !== null),
      oldestYapAgeDays: Math.floor(
        (Date.now() - Math.min(...authored.map((yap) => yap.saidAt.getTime()))) /
          (24 * 60 * 60 * 1000),
      ),
    });
    for (const badge of badges) {
      await prisma.userAchievement.create({ data: { teamId, userId, key: badge.key } });
    }
    void name;
  }

  const [yapCount, auraSum, certified] = await Promise.all([
    prisma.yap.count(),
    prisma.yap.aggregate({ _sum: { aura: true } }),
    prisma.yap.count({ where: { verification: "CERTIFIED" } }),
  ]);

  console.log("YAPPED.");
  console.log(`  ${yapCount} yaps archived`);
  console.log(`  ${reactionRows} reactions`);
  console.log(`  ${witnessRows} witness statements`);
  console.log(`  ${YAPS.filter((y) => y.dispute).length} formally disputed`);
  console.log(`  ${await prisma.yap.count({ where: { acknowledgedAt: { not: null } } })} acknowledged by their author`);
  console.log(`  ${auraSum._sum.aura?.toLocaleString("en-US")} total aura`);
  console.log(`  ${certified} certified yaps`);
  console.log(`  ${battleRows.length} battles`);
  console.log(`  login: anna / yapped123`);
  console.log(
    `  ${UNCLAIMED_YAPPER} is quoted but has no account — claimable by registering` +
      ` under that exact name through an invite link`,
  );
}


export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Refuses to touch a database that holds anyone outside the demo cast, so a
 * stray `db:seed:demo` can never wipe a real archive. Override with
 * SEED_FORCE=true if you really mean it.
 */
export async function assertSafeToSeed(): Promise<void> {
  if (process.env.SEED_FORCE === "true") return;

  const known = new Set<string>([
    ...YAPPERS.map((person) => person.name.toLowerCase()),
    ...AUDIENCE.map((name) => name.toLowerCase()),
  ]);

  const users = await prisma.user.findMany({ select: { displayName: true }, take: 500 });
  const strangers = users.filter((user) => !known.has(user.displayName.toLowerCase()));

  if (strangers.length > 0) {
    throw new Error(
      `This database holds ${strangers.length} record(s) that are not part of the demo cast ` +
        `(e.g. "${strangers[0].displayName}"). Refusing to overwrite a real archive. ` +
        `Set SEED_FORCE=true to override.`,
    );
  }
}
