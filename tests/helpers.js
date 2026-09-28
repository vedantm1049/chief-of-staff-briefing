/* Shared fixtures for the tests. The sample data is read from data/ once per
test file. Tests that change a field work on a deep copy of the loaded files,
never on disk.
*/
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { loadDataFolder } from "../app/engine/sample.js";
import { buildBriefing } from "../app/engine/briefing.js";
import { buildHistory } from "../app/engine/history.js";
import { csvRecords } from "../app/engine/parse.js";
import { day, toIso } from "../app/engine/dates.js";

export const DATA_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
export const TODAY = day(2026, 9, 28);   // week 1 is read on Monday 28 Sep 2026
export const W1 = "2026-09-27", W2 = "2026-10-04", W3 = "2026-10-11", W4 = "2026-10-18";

export async function loadSample() {
  return loadDataFolder(async (rel, kind) => {
    const buf = await readFile(path.join(DATA_ROOT, rel));
    return kind === "bytes" ? new Uint8Array(buf) : buf.toString("utf8");
  });
}

/** A copy that can be edited without touching the shared sample. */
export function copySample(sample) {
  return {
    aliasText: sample.aliasText,
    weeks: sample.weeks.map((w) => ({
      weekEnding: w.weekEnding,
      files: Object.fromEntries(Object.entries(w.files).map(([u, f]) => [u, { ...f }])),
    })),
  };
}

export function week(sample, weekEnding) {
  return sample.weeks.find((w) => w.weekEnding === weekEnding);
}

export function briefWeek(sample, weekEnding, today) {
  return buildBriefing(week(sample, weekEnding), { aliasText: sample.aliasText, today });
}

/** All weeks, oldest first, keyed by week-ending date. */
export function history(sample) {
  return Object.fromEntries(
    buildHistory(sample.weeks, { aliasText: sample.aliasText }).map((b) => [toIso(b.weekEnding), b]));
}

function quote(v) {
  const s = v ?? "";
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Set `updates` on every row where all `match` fields are equal. Returns
the new CSV text. */
export function editCsv(text, match, updates) {
  const { fields, rows } = csvRecords(text);
  for (const row of rows) {
    if (Object.entries(match).every(([k, v]) => row[k] === v)) Object.assign(row, updates);
  }
  return [fields, ...rows.map((r) => fields.map((f) => r[f]))]
    .map((cells) => cells.map(quote).join(","))
    .join("\n") + "\n";
}

export function findCommitment(briefing, { owner, descriptionContains, unit } = {}) {
  const matches = briefing.allCommitments.filter((c) =>
    (owner == null || c.owner === owner)
    && (unit == null || c.unit === unit)
    && (descriptionContains == null || c.description.toLowerCase().includes(descriptionContains.toLowerCase())));
  assert.equal(matches.length, 1,
    `expected 1 match for owner=${owner} unit=${unit} descriptionContains=${descriptionContains}, got ${matches.length}`);
  return matches[0];
}
