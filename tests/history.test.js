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
import { loadExample, history, byId, W1, W2, W3, W4 } from "./helpers.js";

const weeks = history(await loadExample());
const hist = (b, id) => b.comparison.items.get(byId(b, id));
const item = (b, id) => b.classified.get(byId(b, id));
const closed = (b, id) => {
  const matches = b.comparison.closed.filter((x) => x.before.id === id);
  assert.equal(matches.length, 1, `expected ${id} closed once, got ${matches.length}`);
  return matches[0];
};

// --- Whole history -------------------------------------------------------------------

test("four weeks, each scored the Monday after", () => {
  assert.deepEqual(Object.keys(weeks), [W1, W2, W3, W4]);
  for (const [w, b] of Object.entries(weeks)) {
    assert.equal(toIso(b.weekEnding), w);
    assert.equal(b.today - b.weekEnding, 1);
  }
});

test("week one is a baseline", () => {
  const b = weeks[W1];
  assert.equal(b.comparison.previousWeek, null);
  assert.deepEqual(new Set([...b.comparison.items.values()].map((h) => h.label)), new Set(["baseline"]));
});

// --- Week 2 ------------------------------------------------------------------------

test("w2 the visa block is decided: the CEO said yes", () => {
  const x = closed(weeks[W2], "t-visa");
  assert.equal(x.outcome, "decided");
  assert.equal(x.detail, "Yes, go ahead, 29 Sep.");
});

test("w2 closed as done: rider contract, seller contract, board pack", () => {
  const b = weeks[W2];
  for (const id of ["t-riders", "t-seller", "t-board"]) assert.equal(closed(b, id).outcome, "done", id);
});

test("w2 hiring, unblocked and touched, is not flagged", () => {
  assert.ok(!weeks[W2].classified.has(byId(weeks[W2], "t-hiring")));
});

test("w2 the office move rises to the top as its wait grows", () => {
  const b = weeks[W2];
  assert.equal(item(b, "t-office").quadrant, QUADRANT_NEEDS_DECISION_NOW);
  assert.equal(b.quadrants[QUADRANT_NEEDS_DECISION_NOW][0].commitment.id, "t-office");
  assert.equal(hist(b, "t-office").weeksRunning, 2);
});

test("w2 the ice-cream campaign still holds up the branding", () => {
  const b = weeks[W2];
  assert.equal(hist(b, "t-icecream").label, "running");
  assert.deepEqual(item(b, "t-icecream").blocks.map((c) => c.id), ["t-branding"]);
});

test("w2 same-day delivery is a new decision on your radar", () => {
  const b = weeks[W2];
  assert.equal(hist(b, "t-sameday").label, "new");
  assert.equal(item(b, "t-sameday").quadrant, QUADRANT_ON_YOUR_RADAR);
  assert.equal(item(b, "t-sameday").effort, "Medium");
});

test("w2 returns policy: 10 days on Legal, urgent, never called stale", () => {
  const i = item(weeks[W2], "t-returns");
  assert.equal(i.quadrant, QUADRANT_FLAG_DONT_ESCALATE);
  assert.ok(!i.flags.includes("stale"));
});

test("w2 the rider app's 'next Tuesday' rolls forward", () => {
  const h = hist(weeks[W2], "t-riderapp");
  assert.equal(h.weeksRunning, 2);
  assert.deepEqual(h.dueDates, [day(2026, 9, 29), day(2026, 10, 6)]);
  assert.equal(h.dueRaw, "next Tuesday");
});

test("w2 Minutes' delivery time misses again", () => {
  const r = weeks[W2].metricResults.find((x) => x.metric === "Average delivery time");
  assert.ok(r.triggered && r.value === 22.8);
});

// --- Week 3 ------------------------------------------------------------------------

test("w3 the ice-cream campaign is decided after two weeks", () => {
  const x = closed(weeks[W3], "t-icecream");
  assert.ok(x.outcome === "decided" && x.weeksFlagged === 2);
  assert.equal(x.detail, "Chose: option two, the smaller launch, 6 Oct.");
});

test("w3 branding surfaces once its blocker is done, important for the chain behind it", () => {
  const b = weeks[W3];
  const i = item(b, "t-branding");
  assert.deepEqual(i.flags, ["overdue", "stale"]);
  assert.equal(hist(b, "t-branding").label, "new");
  assert.deepEqual(i.blocks.map((c) => c.id), ["t-wash"]);
  assert.deepEqual(i.chain.map((c) => c.id), ["t-b2b"]);
  assert.equal(i.quadrant, QUADRANT_NEEDS_DECISION_NOW);
  assert.deepEqual(b.quadrants[QUADRANT_NEEDS_DECISION_NOW].map((x) => x.commitment.id), ["t-sameday", "t-branding"]);
});

test("w3 the office move is decided; the returns policy, decided by Legal, is done", () => {
  assert.equal(closed(weeks[W3], "t-office").outcome, "decided");
  assert.equal(closed(weeks[W3], "t-returns").outcome, "done");
});

test("w3 the laundry pilot is removed, not done", () => {
  const x = closed(weeks[W3], "t-laundry");
  assert.ok(x.outcome === "dropped" && x.now === null && x.weeksFlagged === 2);
});

test("w3 the workshop gets a date and clears", () => {
  const x = closed(weeks[W3], "t-workshop");
  assert.ok(x.outcome === "cleared" && x.detail.includes("deadline set for 22 Oct"));
});

test("w3 same-day delivery moves to the top, 2nd week running", () => {
  const b = weeks[W3];
  assert.equal(item(b, "t-sameday").quadrant, QUADRANT_NEEDS_DECISION_NOW);
  assert.equal(hist(b, "t-sameday").weeksRunning, 2);
});

test("w3 the payments provider extension is a new decision on your radar", () => {
  const b = weeks[W3];
  assert.equal(hist(b, "t-provider").label, "new");
  assert.equal(item(b, "t-provider").quadrant, QUADRANT_ON_YOUR_RADAR);
});

test("w3 the rider app runs a 3rd week and every metric is met", () => {
  const b = weeks[W3];
  assert.equal(hist(b, "t-riderapp").weeksRunning, 3);
  assert.equal(b.metricResults.filter((r) => r.triggered).length, 0);
});

// --- Week 4, the landing page -------------------------------------------------------

test("w4 top group: the quick yes or no above the longer wait, then the rider app", () => {
  const top = weeks[W4].quadrants[QUADRANT_NEEDS_DECISION_NOW].map((i) => i.commitment.id);
  assert.deepEqual(top, ["t-provider", "t-sameday", "t-riderapp"]);
  assert.ok(item(weeks[W4], "t-sameday").flags.includes("overdue"));
  assert.equal(hist(weeks[W4], "t-sameday").weeksRunning, 3);
});

test("w4 Food's rating miss lifts the rider app to the top", () => {
  const b = weeks[W4];
  const r = b.metricResults.find((x) => x.area === "Wasla Food" && x.metric === "Customer rating");
  assert.ok(r.triggered && r.count === 12000);
  const i = item(b, "t-riderapp");
  assert.ok(i.importanceReasons.includes("Wasla Food missed its Customer rating target this week, which this task is meant to move"));
  assert.equal(b.today - byId(b, "t-riderapp").lastUpdated, 37);
  const h = hist(b, "t-riderapp");
  assert.equal(h.weeksRunning, 4);
  assert.deepEqual(h.dueDates, [day(2026, 9, 29), day(2026, 10, 6), day(2026, 10, 13), day(2026, 10, 20)]);
});

test("w4 Food's other open task, not linked to the rating, is not lifted", () => {
  const b = weeks[W4];
  const menu = byId(b, "t-menu");
  assert.ok(!b.classified.has(menu));   // due 26 Oct, touched 15 Oct: nothing to flag, and no lift
  assert.equal(menu.movesMetric, "");
});

test("w4 branding closes as done after one week", () => {
  const x = closed(weeks[W4], "t-branding");
  assert.ok(x.outcome === "done" && x.weeksFlagged === 1);
});

test("w4 the Wasla Wash launch surfaces overdue and holds up the prototype", () => {
  const i = item(weeks[W4], "t-wash");
  assert.deepEqual(i.flags, ["overdue"]);
  assert.equal(i.quadrant, QUADRANT_FLAG_DONT_ESCALATE);
  assert.deepEqual(i.blocks.map((c) => c.id), ["t-b2b"]);
});

test("w4 the workshop is back, clashing with the brand guidelines", () => {
  const b = weeks[W4];
  const h = hist(b, "t-workshop");
  assert.ok(h.label === "returned" && h.lastFlagged === day(2026, 10, 4));
  assert.deepEqual(b.conflicts.map((p) => [p.owner, p.a.id, p.b.id]), [["Priya Nair", "t-workshop", "t-guidelines"]]);
  assert.equal(hist(b, "t-guidelines").label, "new");
});

test("w4 Labs sent no numbers", () => {
  const labs = weeks[W4].metricResults.filter((r) => r.area === "Wasla Labs");
  assert.equal(labs.length, 3);
  assert.ok(labs.every((r) => !r.reported && r.reason === "not reported this week"));
});
