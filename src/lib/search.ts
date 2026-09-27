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
  caseId?: number;
  aura?: { op: AuraOp; value: number };
  verification?: "UNVERIFIED" | "WITNESSED" | "CONFIRMED" | "CERTIFIED";
  has: Array<"evidence" | "lore" | "witnesses" | "dispute">;
  before?: Date;
  after?: Date;
  unknown: string[];
};

export const SEARCH_QUALIFIERS: Array<{ example: string; blurb: string }> = [
  { example: "from:anna", blurb: "who said it" },
  { example: "by:dima", blurb: "who filed it" },
  { example: "tag:прод", blurb: "tagged" },
  { example: "aura:>500", blurb: "= < > <= >=" },
  { example: "status:certified", blurb: "unverified · witnessed · confirmed · certified" },
  { example: "has:evidence", blurb: "evidence · lore · witnesses · dispute" },
  { example: "before:2026-10-01", blurb: "also after:" },
  { example: "case:1", blurb: "records in one case" },
];

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
      case "case": {
        const id = Number(value);
        if (Number.isInteger(id) && id > 0) filter.caseId = id;
        else filter.unknown.push(token);
        break;
      }
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
    filter.caseId === undefined &&
    !filter.aura &&
    !filter.verification &&
    filter.has.length === 0 &&
    !filter.before &&
    !filter.after
  );
}

const ISO = (date: Date) => date.toISOString().slice(0, 10);

/** One chip per active constraint, for the banner above the feed. */
export function describeFilter(filter: SearchFilter): string[] {
  const chips: string[] = [];
  if (filter.text) chips.push(`“${filter.text}”`);
  if (filter.author) chips.push(`said by ${filter.author}`);
  if (filter.submitter) chips.push(`filed by ${filter.submitter}`);
  if (filter.tag) chips.push(`#${filter.tag}`);
  if (filter.caseId !== undefined) chips.push(`case #${String(filter.caseId).padStart(4, "0")}`);
  if (filter.aura) chips.push(`aura ${filter.aura.op} ${filter.aura.value}`);
  if (filter.verification) chips.push(filter.verification.toLowerCase());
  for (const has of filter.has) chips.push(has === "dispute" ? "disputed" : `has ${has}`);
  if (filter.after) chips.push(`after ${ISO(filter.after)}`);
  if (filter.before) chips.push(`before ${ISO(filter.before)}`);
  return chips;
}
