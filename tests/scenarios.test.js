/* One test per row of docs/dataset_key.md, week 1. The dataset was designed
as a test plan; this file makes it executable. Each comment states the row
it proves.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QUADRANT_NEEDS_DECISION_NOW,
  QUADRANT_FLAG_DONT_ESCALATE,
  QUADRANT_OMIT,
} from "../app/engine/classify.js";
import { toIso } from "../app/engine/dates.js";
import { loadSample, copySample, week, briefWeek, editCsv, findCommitment, TODAY, W1 } from "./helpers.js";

const sample = await loadSample();
const briefing = briefWeek(sample, W1, TODAY);

/** A week-1 copy with one file edited, scored again. */
function rebuiltWith(unit, file, match, updates) {
  const copy = copySample(sample);
  const files = week(copy, W1).files[unit];
  files[file] = editCsv(files[file], match, updates);
  return briefWeek(copy, W1, TODAY);
}

// --- Conflicts ------------------------------------------------------------------

test("layla haddad same day conflict", () => {
  // Layla Haddad: Table's lease renewal and Pay's compliance amendment, both
  // due 2026-09-29. Same day, no alias resolution needed.
  const lease = findCommitment(briefing, { owner: "Layla Haddad", unit: "Wasla Table" });
  const compliance = findCommitment(briefing, { owner: "Layla Haddad", unit: "Wasla Pay" });
  assert.ok((briefing.conflictPartnerMap.get(lease) ?? []).includes(compliance));
  assert.ok((briefing.conflictPartnerMap.get(compliance) ?? []).includes(lease));
});

test("priya nair conflict depends on alias merge", () => {
  // Priya Nair / P. Nair: Eats' and Mart's loyalty-pilot items, one day apart.
  // Only visible if "P. Nair" merges into "Priya Nair".
  const eats = findCommitment(briefing, { owner: "Priya Nair", unit: "Wasla Eats", descriptionContains: "loyalty-points" });
  const mart = findCommitment(briefing, { owner: "Priya Nair", unit: "Wasla Mart" });
  assert.equal(mart.rawOwner, "P. Nair");
  assert.ok((briefing.conflictPartnerMap.get(eats) ?? []).includes(mart));
});

test("priya sla item outside conflict window", () => {
  // Priya's SLA item (due 2026-10-05) is 2 to 3 days from the loyalty pair
  // and must not be pulled into the conflict.
  const sla = findCommitment(briefing, { owner: "Priya Nair", descriptionContains: "SLA" });
  assert.ok(!briefing.conflictPartnerMap.has(sla));
});

test("exactly two conflicts", () => {
  assert.deepEqual(briefing.conflicts.map((p) => p.owner).sort(), ["Layla Haddad", "Priya Nair"]);
});

// --- Alias resolution -------------------------------------------------------------

test("rahul and raj mehta stay distinct", () => {
  // False-positive trap: reviewed in the alias table and not merged.
  const rahul = findCommitment(briefing, { descriptionContains: "commission floor" });
  const raj = findCommitment(briefing, { descriptionContains: "acquiring bank" });
  assert.deepEqual([rahul.owner, raj.owner], ["Rahul Mehta", "Raj Mehta"]);
});

test("nadia osman and nadia farouk stay distinct", () => {
  assert.equal(findCommitment(briefing, { descriptionContains: "Wallet KYC" }).owner, "Nadia Osman");
  assert.equal(findCommitment(briefing, { descriptionContains: "forecast model" }).owner, "Nadia Farouk");
});

test("every owner resolved this week", () => {
  assert.deepEqual(briefing.unresolvedOwners, []);
});

test("unseen shorthand is reported not guessed", () => {
  // If Mart writes "P Nair" (no dot), the table has never seen it. The engine
  // must report it, and the Priya conflict disappears until the table is
  // fixed. That lost conflict is why an unresolved name is surfaced, not ignored.
  const b = rebuiltWith("wasla_mart", "commitments.csv", { owner: "P. Nair" }, { owner: "P Nair" });
  assert.ok(b.unresolvedOwners.some(([raw, unit]) => raw === "P Nair" && unit === "Wasla Mart"));
  assert.deepEqual(b.conflicts.map((p) => p.owner), ["Layla Haddad"]);
});

// --- Staleness ------------------------------------------------------------------

test("mart stockout stale and top quadrant", () => {
  // Due 2026-09-19 (9 days overdue), last touched 2026-09-20, blocks 2 open
  // items. Lands in needs decision now, on a staleness flag.
  const item = findCommitment(briefing, { descriptionContains: "stockout alerting" });
  assert.ok(briefing.stale.has(item));
  assert.equal(briefing.blocksMap.get(item).length, 2);
  const classified = briefing.classified.get(item);
  assert.equal(classified.quadrant, QUADRANT_NEEDS_DECISION_NOW);
  assert.ok(classified.flags.includes("stale"));
});

test("items blocked by stockout are not stale", () => {
  // SOP rewrite (7 days) and Q4 forecast model (10 days) are past the
  // threshold by date, but they are waiting on the stockout fix. Listed on the
  // blocker's card, not flagged as stale in their own right.
  const blocker = findCommitment(briefing, { descriptionContains: "stockout alerting" });
  for (const text of ["SOP rewrite", "forecast model"]) {
    const item = findCommitment(briefing, { descriptionContains: text });
    assert.ok(!briefing.stale.has(item));
    assert.ok(!briefing.classified.has(item));
    assert.ok(briefing.blocksMap.get(blocker).includes(item));
  }
});

test("blocked item goes stale once blocker closes", () => {
  // The exemption only holds while the blocker is open.
  const b = rebuiltWith("wasla_mart", "commitments.csv",
    { description: "Fix stockout alerting for Sharjah dark stores" }, { status: "Done" });
  const forecast = findCommitment(b, { descriptionContains: "forecast model" });
  assert.ok(b.stale.has(forecast));
});

test("express mall retail stale despite hype", () => {
  // Last touched 2026-09-14 (14 days) while the status update calls it
  // "huge momentum". lastUpdated wins over prose.
  const item = findCommitment(briefing, { owner: "Mina" });
  assert.equal(briefing.today - item.lastUpdated, 14);
  assert.ok(briefing.stale.has(item));
  assert.ok(briefing.classified.has(item));
});

test("table no show fee resolved not stale", () => {
  // No status column; description says "resolved, live since last week".
  // Inferring done must suppress an item that looks overdue and stale.
  const item = findCommitment(briefing, { descriptionContains: "no-show fee" });
  assert.ok(item.statusInferred && item.status === "done");
  assert.ok(!briefing.stale.has(item));
  assert.ok(!briefing.classified.has(item));
});

test("mart complete status drops out", () => {
  // Lowercase "complete", Mart's non-standard vocabulary. Misread as open it
  // would be overdue, stale and Flagship.
  const item = findCommitment(briefing, { descriptionContains: "picker-shift rota" });
  assert.ok(item.status === "done" && !item.statusInferred);
  assert.ok(!briefing.stale.has(item));
  assert.ok(!briefing.classified.has(item));
});

// --- Decision pending ------------------------------------------------------------

test("zayd ceo decision tops the briefing", () => {
  // Waiting on CEO sign-off, pending 6 days, confirm/reject. First item in
  // the top group.
  const item = findCommitment(briefing, { owner: "Zayd" });
  assert.ok(item.decisionPending && item.principalBlocked);
  const classified = briefing.classified.get(item);
  assert.equal(classified.quadrant, QUADRANT_NEEDS_DECISION_NOW);
  assert.equal(classified.effort, "Low");
  assert.equal(briefing.quadrants[QUADRANT_NEEDS_DECISION_NOW][0].commitment, item);
});

test("nadia osman legal decision omitted", () => {
  // Blocked on Central Legal, pending 3 days, Core tier, no fan-out, due more
  // than 3 days out. Low importance, low urgency: omit.
  const item = findCommitment(briefing, { owner: "Nadia Osman" });
  assert.ok(item.decisionPending && !item.principalBlocked);
  const classified = briefing.classified.get(item);
  assert.ok(!classified.importance && !classified.urgency);
  assert.equal(classified.quadrant, QUADRANT_OMIT);
});

// --- No due date ------------------------------------------------------------------

test("roadmap workshop needs a deadline", () => {
  const item = findCommitment(briefing, { descriptionContains: "roadmap prioritization" });
  assert.equal(item.dueDate, null);
  assert.ok(briefing.needsDeadlineItems.includes(item));
  assert.ok(!briefing.classified.has(item));
});

// --- Customer health -----------------------------------------------------------------

function health(b, unit) {
  return b.customerHealth.find((r) => r.unitName === unit);
}

test("mart blended rating miss triggers", () => {
  const r = health(briefing, "Wasla Mart");
  assert.ok(r.rating.toFixed(2) === "3.93" && r.triggered);
});

test("eats and pay small misses do not trigger", () => {
  for (const unit of ["Wasla Eats", "Wasla Pay"]) {
    const r = health(briefing, unit);
    assert.ok(r.miss.toFixed(2) === "0.10" && !r.triggered);
  }
});

test("express big miss suppressed by sample floor", () => {
  const r = health(briefing, "Wasla Express");
  assert.ok(r.count === 6 && r.lowSample && !r.triggered);
});

test("central has no customer metric", () => {
  assert.ok(!briefing.customerHealth.some((r) => r.unitName === "Wasla Central"));
});

test("rating miss lifts importance", () => {
  // Mart's miss is listed as an importance reason on its items.
  const item = findCommitment(briefing, { descriptionContains: "stockout alerting" });
  const reasons = briefing.classified.get(item).importanceReasons;
  assert.ok(reasons.some((r) => r.includes("customer-rating")));
});

test("rating miss changes quadrant for non flagship unit", () => {
  // In the shipped snapshot only Mart misses, and Mart is already Flagship,
  // so the signal moves nothing. Make Table miss (4.0 vs 4.5 on 1,150
  // ratings): Layla's lease renewal must move up from flag-don't-escalate.
  const before = findCommitment(briefing, { owner: "Layla Haddad", unit: "Wasla Table" });
  assert.equal(briefing.classified.get(before).quadrant, QUADRANT_FLAG_DONT_ESCALATE);

  const b = rebuiltWith("wasla_table", "kpi_export.csv", {}, { diner_rating_avg: "4.0" });
  const after = findCommitment(b, { owner: "Layla Haddad", unit: "Wasla Table" });
  assert.equal(b.classified.get(after).quadrant, QUADRANT_NEEDS_DECISION_NOW);
});

// --- Format and schema messiness ------------------------------------------------------

test("mart kpi from multi tab excel", () => {
  const mart = briefing.units.wasla_mart;
  assert.deepEqual(new Set(Object.keys(mart.kpiBreakdown)), new Set(["Dubai", "Abu Dhabi", "Sharjah"]));
  assert.equal(mart.kpiBreakdown.Sharjah.order_rating_avg, 3.7);
});

test("express missing gmv is none not zero", () => {
  assert.equal(briefing.units.wasla_express.kpi.gmv_aed ?? null, null);
});

test("table status always inferred", () => {
  const table = briefing.allCommitments.filter((c) => c.unit === "Wasla Table");
  assert.ok(table.length === 3 && table.every((c) => c.statusInferred));
});

test("pay regulatory deadline loaded but unscored", () => {
  assert.equal(findCommitment(briefing, { owner: "Layla Haddad", unit: "Wasla Pay" }).regulatoryDeadline, true);
});

test("week ending read from data", () => {
  assert.equal(toIso(briefing.weekEnding), "2026-09-27");
});
