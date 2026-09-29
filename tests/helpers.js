/* Shared fixtures for the tests. The example company is read from
data/example.json once per test file. Tests that change something work on a
fresh copy, never on disk.
*/
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { cleanWorkspace } from "../app/ui/store.js";
import { weeksForEngine, peopleRows } from "../app/ui/weekly.js";
import { buildHistory } from "../app/engine/history.js";
import { toIso } from "../app/engine/dates.js";

export const EXAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "example.json");
export const W1 = "2026-09-27", W2 = "2026-10-04", W3 = "2026-10-11", W4 = "2026-10-18";

/** The example as the page keeps it. Each call is a fresh copy. */
export async function loadExample() {
  return cleanWorkspace("example", JSON.parse(await readFile(EXAMPLE, "utf8")));
}

/** Every week scored, oldest first, keyed by week-ending date. */
export function history(company) {
  return Object.fromEntries(
    buildHistory(weeksForEngine(company), { setup: company.setup, aliases: peopleRows(company.people) })
      .map((b) => [toIso(b.weekEnding), b]));
}

/** The task list of one week: frozen for a past week, live for the current one. */
export function tasksOf(company, weekEnding) {
  const w = company.weeks.find((x) => x.weekEnding === weekEnding);
  return w.tasks ?? company.tasks;
}

export function byId(briefing, id) {
  const matches = briefing.allCommitments.filter((c) => c.id === id);
  assert.equal(matches.length, 1, `expected task ${id} once, got ${matches.length}`);
  return matches[0];
}
