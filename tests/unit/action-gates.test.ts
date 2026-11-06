import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ACTIONS = path.resolve(import.meta.dirname, "../../src/app/actions.ts");

/**
 * A server action is a public endpoint with a nicer calling convention.
 *
 * Whatever the interface chooses to draw, anyone who can reach the page can
 * invoke the action with arguments of their own. This has already gone wrong
 * here once: the admin page drew the role controls for the owner alone while
 * the actions behind them accepted any moderator, so a crafted request did
 * what the screen refused to offer.
 *
 * So the rule is about the service a function reaches for, not about what it
 * is called. Anything that writes to the roster, the team's settings or a
 * person's standing in it has to resolve an administrator first, in its own
 * body — a check somewhere else in the file protects nothing.
 *
 * Invitations are deliberately not on this list: any member may hand one out,
 * and `createInvite` gates on membership instead.
 */
const PRIVILEGED = /\b(setMemberRole|removeMember|setEmployment|renameTeam|setTeamTimezone|issueReset)\(/;
const GATES = /\b(requireTeamAdmin|requireOperator)\(/;

/** Each exported action, with its body, as written. */
function actions(source: string): Array<[string, string]> {
  const starts = [...source.matchAll(/export async function (\w+)/g)];
  return starts.map((match, index) => {
    const from = match.index!;
    const to = starts[index + 1]?.index ?? source.length;
    return [match[1]!, source.slice(from, to)] as [string, string];
  });
}

describe("server actions", () => {
  test("every write to the roster resolves an administrator in its own body", () => {
    const source = readFileSync(ACTIONS, "utf8");
    const offenders = actions(source)
      .filter(([, body]) => PRIVILEGED.test(body) && !GATES.test(body))
      .map(([name]) => name);

    assert.deepEqual(
      offenders,
      [],
      `these are reachable by anyone who can post to them: ${offenders.join(", ")}`,
    );
  });

  test("the rule is checking something — the privileged list is not stale", () => {
    const source = readFileSync(ACTIONS, "utf8");
    const guarded = actions(source).filter(([, body]) => PRIVILEGED.test(body));
    assert.ok(guarded.length >= 6, `only ${guarded.length} privileged actions were recognised`);
  });
});
