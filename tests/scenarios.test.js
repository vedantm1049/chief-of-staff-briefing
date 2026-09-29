/* Week 1 of docs/dataset_key.md, one test per row. The example was designed
as a test plan; this file makes it executable. Each comment states the row
it proves.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QUADRANT_NEEDS_DECISION_NOW,
  QUADRANT_ON_YOUR_RADAR,
  QUADRANT_FLAG_DONT_ESCALATE,
  QUADRANT_OMIT,
} from "../app/engine/classify.js";
import { loadExample, history, byId, W1 } from "./helpers.js";

const company = await loadExample();
const b = history(company)[W1];
const item = (id) => b.classified.get(byId(b, id));
const top = () => b.quadrants[QUADRANT_NEEDS_DECISION_NOW].map((i) => i.commitment.id);

// --- Waiting on the CEO --------------------------------------------------------------

test("visa fines: a yes or no for the CEO, first in the top group", () => {
  const visa = byId(b, "t-visa");
  assert.ok(visa.decisionPending && visa.principalBlocked);
  assert.equal(item("t-visa").effort, "Low");
  assert.equal(top()[0], "t-visa");
  assert.deepEqual(item("t-visa").blocks.map((c) => c.id), ["t-hiring"]);
});

test("ice-cream campaign: overdue, three options, second below the quicker decision", () => {
  const i = item("t-icecream");
  assert.deepEqual(i.flags, ["decision-pending", "overdue"]);
  assert.equal(i.effort, "Medium");
  assert.equal(top()[1], "t-icecream");
  assert.deepEqual(i.blocks.map((c) => c.id), ["t-branding"]);
  assert.deepEqual(i.chain.map((c) => c.id), ["t-wash", "t-b2b"]);
  assert.ok(i.importanceReasons.includes("holds up 3 open items, 1 directly and 2 down the chain"));
});

test("office move: waits on the CEO, not yet urgent, on your radar", () => {
  const i = item("t-office");
  assert.ok(i.importance && !i.urgency);
  assert.equal(i.quadrant, QUADRANT_ON_YOUR_RADAR);
});

// --- A chain of blocked work ------------------------------------------------------------

test("the blocked chain is listed on its blockers, never flagged itself", () => {
  // Branding is overdue and untouched 16 days, hiring untouched 13 days: both
  // would be flagged if they weren't waiting on an open item.
  for (const id of ["t-branding", "t-wash", "t-b2b", "t-hiring"]) {
    const c = byId(b, id);
    assert.ok(!b.classified.has(c), id);
    assert.ok(!b.stale.has(c) && !b.overdue.has(c), id);
  }
  assert.deepEqual(b.blocksMap.get(byId(b, "t-branding")).map((c) => c.id), ["t-wash"]);
  assert.deepEqual(b.blocksMap.get(byId(b, "t-wash")).map((c) => c.id), ["t-b2b"]);
});

// --- Overdue in a Flagship business -------------------------------------------------------

test("rider agency contract: overdue in a Flagship business, after the decisions", () => {
  assert.deepEqual(item("t-riders").flags, ["overdue"]);
  assert.deepEqual(top(), ["t-visa", "t-icecream", "t-riders"]);
});

// --- Stalled work -----------------------------------------------------------------------

test("rider app: stale despite 'huge momentum', due next Tuesday, flag don't escalate", () => {
  const c = byId(b, "t-riderapp");
  assert.equal(b.today - c.lastUpdated, 16);
  assert.ok(c.dueDateApprox);
  assert.deepEqual(item("t-riderapp").flags, ["stale"]);
  assert.deepEqual(item("t-riderapp").urgencyReasons, ["due in 1 day"]);
  assert.equal(item("t-riderapp").quadrant, QUADRANT_FLAG_DONT_ESCALATE);
});

test("laundry pilot: stale but Experimental and not urgent, omit", () => {
  assert.deepEqual(item("t-laundry").flags, ["stale"]);
  assert.equal(item("t-laundry").quadrant, QUADRANT_OMIT);
});

// --- One person, two deadlines -----------------------------------------------------------

test("Layla: seller contract and board pack a day apart, a conflict", () => {
  assert.deepEqual(b.conflicts.map((p) => [p.owner, p.a.id, p.b.id, p.daysApart]),
    [["Layla Haddad", "t-seller", "t-board", 1]]);
  assert.equal(item("t-seller").quadrant, QUADRANT_FLAG_DONT_ESCALATE);
});

// --- Waiting on someone else ---------------------------------------------------------------

test("returns policy: waiting on Legal, not the CEO, omit", () => {
  const c = byId(b, "t-returns");
  assert.ok(c.decisionPending && !c.principalBlocked);
  assert.equal(item("t-returns").quadrant, QUADRANT_OMIT);
});

// --- No deadline ----------------------------------------------------------------------------

test("brand refresh workshop: no due date, needs a deadline set", () => {
  const c = byId(b, "t-workshop");
  assert.ok(b.needsDeadlineItems.includes(c));
  assert.ok(!b.classified.has(c));
});

// --- Metrics --------------------------------------------------------------------------------

const metric = (area, name) => b.metricResults.find((r) => r.area === area && r.metric === name);

test("Minutes' delivery time misses, lower is better, and moves nothing", () => {
  const r = metric("Wasla Minutes", "Average delivery time");
  assert.ok(r.triggered);
  assert.equal(r.reason, "17.5% above target, more than the 10% margin");
  assert.ok(item("t-riders").importanceReasons.includes("Wasla Minutes is Flagship tier"));
});

test("Wasla.com's rating is within its 0.1 margin", () => {
  const r = metric("Wasla.com", "Customer rating");
  assert.ok(!r.triggered && r.shortfall.toFixed(2) === "0.04");
});

test("every other metric is met", () => {
  assert.deepEqual(b.metricResults.filter((r) => r.triggered).map((r) => r.metric), ["Average delivery time"]);
  assert.ok(b.metricResults.every((r) => r.reported));
});

// --- People ---------------------------------------------------------------------------------

test("every owner is known, the Mehtas stay two people, P. Nair is Priya", () => {
  assert.deepEqual(b.unresolvedOwners, []);
  assert.deepEqual(b.unknownAreas, []);
  assert.equal(byId(b, "t-returns").owner, "Rahul Mehta");
  assert.equal(byId(b, "t-payments").owner, "Raj Mehta");
  assert.deepEqual(company.people.find((p) => p.name === "Priya Nair").spellings, ["P. Nair"]);
});
