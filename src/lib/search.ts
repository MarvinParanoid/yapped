/**
 * Search qualifiers — GitHub-style, for an archive read by people who live in
 * GitHub search.
 *
 *   плесень from:anna aura:>500 has:evidence status:certified before:2026-10-01
 *
 * Pure module: parsing only, no database, no framework. Anything it does not
 * recognise is handed back in `unknown` so the UI can say so instead of
 * silently dropping it.
 */
export type AuraOp = ">" | ">=" | "<" | "<=" | "=";

export type SearchFilter = {
  text: string;
  author?: string;
  submitter?: string;
  tag?: string;
  aura?: { op: AuraOp; value: number };
  verification?: "UNVERIFIED" | "WITNESSED" | "CONFIRMED" | "CERTIFIED";
  has: Array<"evidence" | "lore" | "witnesses" | "dispute">;
  before?: Date;
  after?: Date;
  unknown: string[];
};

export const SEARCH_QUALIFIERS = [
  { example: "from:anna", hint: "whoSaid" },
  { example: "by:dima", hint: "whoFiled" },
  { example: "tag:прод", hint: "tagged" },
  { example: "aura:>500", hint: "comparison" },
  { example: "status:certified", hint: "statuses" },
  { example: "has:evidence", hint: "haves" },
  { example: "before:2026-10-01", hint: "alsoAfter" },
] as const;

const EMPTY: SearchFilter = { text: "", has: [], unknown: [] };

/** Splits on whitespace but keeps "quoted phrases" together. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    tokens.push(match[1] !== undefined ? `"${match[1]}"` : match[2]);
  }
  return tokens;
}

function parseDate(raw: string): Date | null {
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAura(raw: string): SearchFilter["aura"] | null {
  const match = /^(>=|<=|>|<|=)?(-?\d+)$/.exec(raw);
  if (!match) return null;
  return { op: (match[1] as AuraOp) ?? "=", value: Number(match[2]) };
}

export function parseSearch(input: string): SearchFilter {
  if (!input.trim()) return { ...EMPTY };

  const filter: SearchFilter = { text: "", has: [], unknown: [] };
  const words: string[] = [];

  for (const token of tokenize(input)) {
    const separator = token.indexOf(":");
    if (separator <= 0 || token.startsWith('"')) {
      words.push(token.replace(/^"|"$/g, ""));
      continue;
    }

    const key = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1).replace(/^"|"$/g, "");
    if (!value) {
      filter.unknown.push(token);
      continue;
    }

    switch (key) {
      case "from":
      case "author":
        filter.author = value;
        break;
      case "by":
      case "submitter":
        filter.submitter = value;
        break;
      case "tag":
        filter.tag = value.replace(/^#/, "").toLowerCase();
        break;
      case "aura": {
        const aura = parseAura(value);
        if (aura) filter.aura = aura;
        else filter.unknown.push(token);
        break;
      }
      case "status":
      case "is": {
        const upper = value.toUpperCase();
        if (["UNVERIFIED", "WITNESSED", "CONFIRMED", "CERTIFIED"].includes(upper)) {
          filter.verification = upper as SearchFilter["verification"];
        } else if (upper === "DISPUTED") {
          filter.has.push("dispute");
        } else {
          filter.unknown.push(token);
        }
        break;
      }
      case "has": {
        const lower = value.toLowerCase();
        if (["evidence", "lore", "witnesses", "dispute"].includes(lower)) {
          filter.has.push(lower as SearchFilter["has"][number]);
        } else {
          filter.unknown.push(token);
        }
        break;
      }
      case "before": {
        const date = parseDate(value);
        if (date) filter.before = date;
        else filter.unknown.push(token);
        break;
      }
      case "after": {
        const date = parseDate(value);
        if (date) filter.after = date;
        else filter.unknown.push(token);
        break;
      }
      default:
        filter.unknown.push(token);
    }
  }

  filter.text = words.join(" ").trim();
  return filter;
}

export function isEmptyFilter(filter: SearchFilter): boolean {
  return (
    !filter.text &&
    !filter.author &&
    !filter.submitter &&
    !filter.tag &&
    !filter.aura &&
    !filter.verification &&
    filter.has.length === 0 &&
    !filter.before &&
    !filter.after
  );
}

const ISO = (date: Date) => date.toISOString().slice(0, 10);

/** One chip per active constraint, for the banner above the feed. */
/**
 * The chips above the feed, as keys and their values — the module stays pure
 * and the interface words them.
 */
export type FilterChip =
  | { kind: "text"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "verification"; value: "UNVERIFIED" | "WITNESSED" | "CONFIRMED" | "CERTIFIED" }
  | { kind: "saidBy" | "filedBy"; name: string }
  | { kind: "auraChip"; op: string; value: number }
  | { kind: "hasChip"; what: string }
  | { kind: "disputedChip" }
  | { kind: "afterChip" | "beforeChip"; date: string };

export function describeFilter(filter: SearchFilter): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filter.text) chips.push({ kind: "text", value: filter.text });
  if (filter.author) chips.push({ kind: "saidBy", name: filter.author });
  if (filter.submitter) chips.push({ kind: "filedBy", name: filter.submitter });
  if (filter.tag) chips.push({ kind: "tag", value: filter.tag });
  if (filter.aura) chips.push({ kind: "auraChip", op: filter.aura.op, value: filter.aura.value });
  if (filter.verification) chips.push({ kind: "verification", value: filter.verification });
  for (const has of filter.has) {
    chips.push(has === "dispute" ? { kind: "disputedChip" } : { kind: "hasChip", what: has });
  }
  if (filter.after) chips.push({ kind: "afterChip", date: ISO(filter.after) });
  if (filter.before) chips.push({ kind: "beforeChip", date: ISO(filter.before) });
  return chips;
}
