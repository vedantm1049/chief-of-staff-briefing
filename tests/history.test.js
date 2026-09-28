/* Weeks 2 to 4 of docs/dataset_key.md: carry-overs, closures and the
week-over-week comparison. Each comment states the row it proves.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QUADRANT_NEEDS_DECISION_NOW,
  QUADRANT_ON_YOUR_RADAR,
  QUADRANT_FLAG_DONT_ESCALATE,
} from "../app/engine/classify.js";
import { day, toIso } from "../app/engine/dates.js";
import { loadSample, copySample, week, history, editCsv, findCommitment, W1, W2, W3, W4 } from "./helpers.js";

const sample = await loadSample();
const weeks = history(sample);

function hist(b, c) {
  return b.comparison.items.get(c);
}

function closed(b, titleStart) {
  const matches = b.comparison.closed.filter((x) => x.before.description.startsWith(titleStart));
  assert.equal(matches.length, 1, `expected 1 closed item starting ${titleStart}, got ${matches.length}`);
  return matches[0];
}

// --- Whole history -------------------------------------------------------------------

test("four weeks scored the monday after", () => {
  assert.deepEqual(Object.keys(weeks), [W1, W2, W3, W4]);
  for (const [w, b] of Object.entries(weeks)) {
    assert.equal(toIso(b.weekEnding), w);
    assert.equal(b.today - b.weekEnding, 1);
  }
});

test("kpi week ending matches folder", () => {
  for (const [w, b] of Object.entries(weeks)) {
    const stamped = new Set(Object.values(b.units).filter((u) => u.kpi.week_ending).map((u) => String(u.kpi.week_ending)));
    assert.deepEqual(stamped, new Set([w]));
  }
});

test("no two items share a title", () => {
  for (const b of Object.values(weeks)) assert.deepEqual(b.comparison.duplicateTitles, []);
});

test("week one is a baseline", () => {
  const b = weeks[W1];
  assert.equal(b.comparison.previousWeek, null);
  assert.deepEqual(new Set([...b.comparison.items.values()].map((h) => h.label)), new Set(["baseline"]));
  assert.deepEqual(b.comparison.closed, []);
});

// --- Week 2 ------------------------------------------------------------------------

test("w2 decisions and deliveries close as done", () => {
  // Zayd's decision, both loyalty-pilot sides and Pay's compliance amendment
  // were all flagged in week 1 and marked done by week 2.
  const b = weeks[W2];
  for (const start of ["Waiting on CEO sign-off on partner-tier", "Launch loyalty-points pilot",
    "Loyalty-points pilot data integration", "Finalize compliance amendment"]) {
    assert.equal(closed(b, start).outcome, "done");
  }
});

test("w2 touched but overdue item stays on the briefing", () => {
  // The stockout fix was touched on 1 Oct, so it is no longer stale, but it
  // is 16 days overdue. The overdue rule keeps it at the top, 2nd week running.
  const b = weeks[W2];
  const item = findCommitment(b, { descriptionContains: "stockout alerting" });
  const classified = b.classified.get(item);
  assert.deepEqual(classified.flags, ["overdue"]);
  assert.equal(classified.quadrant, QUADRANT_NEEDS_DECISION_NOW);
  assert.ok(hist(b, item).label === "running" && hist(b, item).weeksRunning === 2);
});

test("w2 carry over follows the item not the flag", () => {
  // Layla's lease was a conflict in week 1 and is overdue in week 2. Same
  // item, so it reads as 2nd week running, not new.
  const b = weeks[W2];
  const lease = findCommitment(b, { owner: "Layla Haddad", unit: "Wasla Table" });
  assert.deepEqual(b.classified.get(lease).flags, ["overdue"]);
  assert.equal(hist(b, lease).weeksRunning, 2);
});

test("w2 free text due date rolls forward", () => {
  // Mina's item says "next Tuesday" every week, so it is never overdue.
  // The history shows the date moving: 29 Sep, then 6 Oct.
  const b = weeks[W2];
  const h = hist(b, findCommitment(b, { owner: "Mina" }));
  assert.deepEqual(h.dueDates, [day(2026, 9, 29), day(2026, 10, 6)]);
  assert.equal(h.dueRaw, "next Tuesday");
});

test("w2 legal decision rises as the wait grows", () => {
  // Nadia Osman's KYC decision: omitted in week 1 at 3 days pending, flagged
  // in week 2 at 10 days. A decision's wait is never labelled stale.
  const b = weeks[W2];
  const classified = b.classified.get(findCommitment(b, { owner: "Nadia Osman" }));
  assert.equal(classified.quadrant, QUADRANT_FLAG_DONT_ESCALATE);
  assert.ok(!classified.flags.includes("stale"));
});

test("w2 new ceo decision is new", () => {
  const b = weeks[W2];
  const item = findCommitment(b, { owner: "Farah Al Mansoori", descriptionContains: "expansion budget" });
  assert.equal(hist(b, item).label, "new");
  assert.equal(b.classified.get(item).quadrant, QUADRANT_ON_YOUR_RADAR);
  assert.equal(b.classified.get(item).effort, "Medium");
});

test("w2 blank mart status read from text", () => {
  const b = weeks[W2];
  const sop = findCommitment(b, { descriptionContains: "SOP rewrite" });
  assert.ok(sop.statusRaw === "" && sop.statusInferred && sop.status === "open");
  assert.ok(!b.classified.has(sop));   // blocked by the stockout fix
});

test("w2 touched item clears", () => {
  const x = closed(weeks[W2], "Update group-wide data-processing");
  assert.ok(x.outcome === "cleared" && x.detail.includes("updated 2 Oct"));
});

// --- Week 3 ------------------------------------------------------------------------

test("w3 stockout fix closes after two weeks", () => {
  const x = closed(weeks[W3], "Fix stockout alerting");
  assert.ok(x.outcome === "done" && x.weeksFlagged === 2);
  assert.equal(x.now.statusRaw, "done");   // Mart's lowercase vocabulary
});

test("w3 blocker done exposes stalled item", () => {
  // With the stockout fix done, the forecast model's 24-day silence counts.
  // It shows up new, with its due date moved from 12 Oct to 19 Oct.
  const b = weeks[W3];
  const item = findCommitment(b, { descriptionContains: "forecast model" });
  assert.deepEqual(b.classified.get(item).flags, ["stale"]);
  assert.equal(hist(b, item).label, "new");
  assert.deepEqual(hist(b, item).dueDates, [day(2026, 10, 12), day(2026, 10, 19)]);
});

test("w3 deadline set clears the workshop", () => {
  const x = closed(weeks[W3], "Q4 product roadmap");
  assert.ok(x.outcome === "cleared" && x.detail.includes("deadline set for 22 Oct"));
});

test("w3 missing kpi column is tolerated", () => {
  const express = weeks[W3].units.wasla_express;
  assert.ok(!("avg_delivery_time_min" in express.kpi));
  assert.equal(express.customerMetric.rating, 3.6);
});

// --- Week 4, the landing page -------------------------------------------------------

test("w4 top quadrant order", () => {
  // Raj's confirm/reject (Low effort) above Farah's three-option choice
  // (Medium), even though Farah has waited longer. Then Mina.
  const top = weeks[W4].quadrants[QUADRANT_NEEDS_DECISION_NOW].map((i) => i.commitment.owner);
  assert.deepEqual(top, ["Raj Mehta", "Farah Al Mansoori", "Mina"]);
});

test("w4 waiting on the ceo three weeks", () => {
  const b = weeks[W4];
  const item = findCommitment(b, { owner: "Farah Al Mansoori", descriptionContains: "expansion budget" });
  assert.equal(hist(b, item).weeksRunning, 3);
  assert.ok(b.classified.get(item).flags.includes("overdue"));
});

test("w4 rating miss lifts an experimental unit", () => {
  // Express clears the 10-rating floor for the first time (15 ratings) and
  // misses by 0.5. That lifts Mina's untouched item to the top group, in its
  // 4th week running, with its due date moved four times.
  const b = weeks[W4];
  const express = b.customerHealth.find((r) => r.unitName === "Wasla Express");
  assert.ok(express.triggered && express.count === 15);
  const mina = findCommitment(b, { owner: "Mina" });
  assert.equal(b.classified.get(mina).quadrant, QUADRANT_NEEDS_DECISION_NOW);
  assert.equal(hist(b, mina).weeksRunning, 4);
  assert.equal(hist(b, mina).dueDates.length, 4);
});

test("w4 blocked by matches a title", () => {
  // Zayd's onboarding item names Mina's item by title only.
  const b = weeks[W4];
  const mina = findCommitment(b, { owner: "Mina" });
  const onboarding = findCommitment(b, { owner: "Zayd" });
  assert.ok(b.classified.get(mina).blocks.includes(onboarding));
});

test("w4 item deleted without being done", () => {
  const x = closed(weeks[W4], "Diner NPS survey redesign");
  assert.ok(x.outcome === "dropped" && x.now === null && x.weeksFlagged === 3);
});

test("w4 workshop is back", () => {
  // Flagged weeks 1 and 2, cleared in week 3, back in week 4 in a same-day
  // clash with Omar's results-call prep.
  const b = weeks[W4];
  const h = hist(b, findCommitment(b, { descriptionContains: "roadmap prioritization" }));
  assert.ok(h.label === "returned" && h.lastFlagged === day(2026, 10, 4));
  assert.deepEqual(b.conflicts.map((p) => p.owner), ["Omar Siddiqui"]);
});

test("w4 mart rating recovered", () => {
  const b = weeks[W4];
  const now = b.customerHealth.find((r) => r.unitName === "Wasla Mart");
  const before = b.comparison.prevHealth["Wasla Mart"];
  assert.ok(before.triggered && !now.triggered);
});

test("w4 unseen name is reported", () => {
  assert.deepEqual(weeks[W4].unresolvedOwners, [["L. Haddad", "Wasla Eats"]]);
});

test("w4 fixing the alias table reveals a hidden clash", () => {
  // Adding "L. Haddad" to the alias table shows Layla on the Eats vendor
  // agreement (due 21 Oct) and her board pack review (due 20 Oct). The Eats
  // item is Flagship and due in 2 days: it goes straight to the top.
  const copy = copySample(sample);
  copy.aliasText += "L. Haddad,Wasla Eats,Layla Haddad,added after week 4 review\n";
  const b = Object.values(history(copy)).at(-1);
  assert.deepEqual(b.unresolvedOwners, []);
  assert.deepEqual(b.conflicts.map((p) => p.owner).sort(), ["Layla Haddad", "Omar Siddiqui"]);
  const msa = findCommitment(b, { descriptionContains: "rider-fleet" });
  assert.equal(b.classified.get(msa).quadrant, QUADRANT_NEEDS_DECISION_NOW);
});

test("reassigned item keeps its history", () => {
  // Identity is unit plus title, not owner. Hand Layla's lease to Reem in
  // week 3 and it is still the 3rd week running, not a new item.
  const copy = copySample(sample);
  const files = week(copy, W3).files.wasla_table;
  files["commitments.csv"] = editCsv(files["commitments.csv"], { owner: "Layla Haddad" }, { owner: "Reem Qassim" });
  const b = history(copy)[W3];
  const lease = findCommitment(b, { descriptionContains: "countersign" });
  assert.equal(lease.owner, "Reem Qassim");
  assert.equal(hist(b, lease).weeksRunning, 3);
});
