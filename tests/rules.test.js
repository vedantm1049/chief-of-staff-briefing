/* Edge cases the shipped snapshot doesn't contain but the data contract says
the engine must handle.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyCommitment, QUADRANT_NEEDS_DECISION_NOW } from "../app/engine/classify.js";
import { makeCommitment } from "../app/engine/loaders.js";
import {
  normalizeStatus,
  inferStatusFromText,
  isDecisionPending,
  isBlockedOnPrincipal,
  parseDueDate,
} from "../app/engine/normalize.js";
import { needsDeadlineSet, itemTitle, isStale, isOverdue, blockedItems, downstreamItems } from "../app/engine/rules.js";
import { day } from "../app/engine/dates.js";

const TODAY = day(2026, 9, 28);   // a Monday

function make(fields) {
  return makeCommitment({ area: "Wasla Pay", rawOwner: "X", owner: "X", statusRaw: "Open", lastUpdated: TODAY, ...fields });
}

for (const [raw, expected] of [
  ["done", "done"], ["Done", "done"], ["complete", "done"], [" Completed ", "done"],
  ["Pending Decision", "pending_decision"], ["Waiting on decision", "pending_decision"],
  ["in progress", "open"], ["In progress", "open"], ["Open", "open"],
  ["", null], [null, null],
]) {
  test(`status words [${JSON.stringify(raw)}]`, () => {
    assert.equal(normalizeStatus(raw), expected);
  });
}

for (const [text, expected] of [
  ["Rollout resolved, live since last week", "done"],
  ["Still waiting on redlines", "open"],
  ["Sent follow-up, no response yet", "open"],
  ["Quarterly review", "open"],
  ["Live since Monday", "done"],
]) {
  test(`status inferred from text [${text}]`, () => {
    assert.equal(inferStatusFromText(text), expected);
  });
}

for (const [raw, expected, approx] of [
  ["2026-10-02", day(2026, 10, 2), false],
  ["end of this week", day(2026, 10, 2), true],
  ["end of next week", day(2026, 10, 9), true],
  ["next Tuesday", day(2026, 9, 29), true],
  ["next Monday", day(2026, 10, 5), true],
  ["in 2 weeks", day(2026, 10, 12), true],
  ["", null, false],
  ["TBD", null, true],
]) {
  test(`due date parsing [${JSON.stringify(raw)}]`, () => {
    assert.deepEqual(parseDueDate(raw, TODAY), [expected, approx]);
  });
}

test("unreadable due date needs a deadline", () => {
  // "TBD" must not be scored as simply not urgent.
  const [due, approx] = parseDueDate("TBD", TODAY);
  assert.ok(needsDeadlineSet(make({ dueDateRaw: "TBD", dueDate: due, dueDateApprox: approx })));
});

test("decision trigger phrases in description", () => {
  // Closed vocabulary catches a decision written in the task text.
  assert.ok(isDecisionPending("open", "Waiting on CEO sign-off for the rate card"));
  assert.ok(isDecisionPending("open", "Awaiting decision from Group Finance"));
  assert.ok(!isDecisionPending("open", "Got sign-off last week, rolling out"));
  assert.ok(!isDecisionPending("done", "Pending decision, now closed"));
});

test("principal match is whole word", () => {
  assert.ok(isBlockedOnPrincipal("Waiting on CEO sign-off", ""));
  assert.ok(!isBlockedOnPrincipal("Awaiting decision on loan principal schedule", ""));
  assert.ok(!isBlockedOnPrincipal("Awaiting decision on sale proceeds", "Treasury"));
});

test("waiting on column names the principal", () => {
  // The template's waiting_on column is enough, even when the text never
  // says who the decision waits on.
  assert.ok(isBlockedOnPrincipal("Q1 hiring plan", "CEO"));
  assert.ok(!isBlockedOnPrincipal("Q1 hiring plan", "Central Legal"));
});

test("waiting on says who, whatever the task's wording", () => {
  // A decision the CEO sent back to the owner with a question waits on the
  // owner, even though the task still says "for the CEO".
  assert.ok(!isBlockedOnPrincipal("Pick a launch plan, three options for the CEO", "Rahul Mehta"));
  assert.ok(isBlockedOnPrincipal("Pick a launch plan, three options for the CEO", ""));
});

test("the principal's title comes from setup", () => {
  assert.ok(isBlockedOnPrincipal("Budget", "Managing Director", "Managing Director"));
  assert.ok(isBlockedOnPrincipal("Waiting on the managing  director", "", "Managing Director"));
  assert.ok(!isBlockedOnPrincipal("Budget", "CEO", "Managing Director"));
});

test("decision types in the template's words set effort", () => {
  for (const [type, effort] of [["Yes or no", "Low"], ["Pick an option", "Medium"], ["Open question", "High"],
    ["confirm/reject", "Low"], ["", "Unknown"]]) {
    const item = make({ status: "pending_decision", decisionPending: true, decisionType: type });
    assert.equal(classifyCommitment(item, TODAY, [], new Set()).effort, effort, type);
  }
});

test("overdue decision is urgent even if recently pending", () => {
  // Urgency signals are OR'd for every item. A decision 4 days overdue that
  // entered Pending Decision only 2 days ago is still urgent.
  const item = make({ area: "Wasla Eats", status: "pending_decision", decisionPending: true,
    dueDate: TODAY - 4, lastUpdated: TODAY - 2 });
  const classified = classifyCommitment(item, TODAY, [], new Set(), { "Wasla Eats": "Flagship" });
  assert.ok(classified.urgency);
  assert.equal(classified.quadrant, QUADRANT_NEEDS_DECISION_NOW);
});

test("a metric miss lifts only the tasks linked to that metric", () => {
  const missed = new Map([["Wasla Pay", ["Sales"]]]);
  const linked = classifyCommitment(make({ movesMetric: "sales" }), TODAY, [], missed);
  const other = classifyCommitment(make({ movesMetric: "Churn" }), TODAY, [], missed);
  const none = classifyCommitment(make({}), TODAY, [], missed);
  assert.ok(linked.importance);
  assert.ok(!other.importance && !none.importance);
});

test("core and experimental tiers score the same", () => {
  // Only Flagship lifts importance. Core ranks above Experimental only in
  // the order inside a group.
  for (const area of ["Wasla Pay", "Wasla Express"]) {
    const c = classifyCommitment(make({ area }), TODAY, [], new Set());
    assert.ok(!c.importance);
  }
});

test("stale threshold is seven days inclusive", () => {
  // The shipped data has no open, unblocked item at exactly 7 days.
  assert.ok(isStale(make({ lastUpdated: TODAY - 7 }), TODAY, []));
  assert.ok(!isStale(make({ lastUpdated: TODAY - 6 }), TODAY, []));
});

test("blocking two open items lifts importance", () => {
  // In the shipped data the only item with fan-out is Flagship, so the
  // fan-out rule never changes a score on its own.
  const blocker = make({ area: "Wasla Pay" });
  const one = classifyCommitment(blocker, TODAY, [make({})], new Set());
  const two = classifyCommitment(blocker, TODAY, [make({}), make({})], new Set());
  assert.ok(!one.importance);
  assert.ok(two.importance && two.importanceReasons.includes("blocks 2 other open items"));
});

test("the whole chain behind an item counts toward holding up two", () => {
  // A holds up B directly, and B holds up C: A holds up two open items.
  const a = make({ description: "Approve budget" });
  const b = make({ description: "Hire agency", blockedBy: "Approve budget" });
  const c = make({ description: "Launch campaign", blockedBy: "Hire agency" });
  const all = [a, b, c];
  const blocksMap = new Map(all.map((x) => [x, blockedItems(x, all)]));
  const chain = downstreamItems(blocksMap.get(a), blocksMap);
  assert.deepEqual(chain, [c]);
  const classified = classifyCommitment(a, TODAY, blocksMap.get(a), new Set(), {}, chain);
  assert.ok(classified.importance);
  assert.deepEqual(classified.importanceReasons, ["holds up 2 open items, 1 directly and 1 down the chain"]);
  assert.ok(!classifyCommitment(b, TODAY, blocksMap.get(b), new Set(), {}, []).importance);
});

test("a chain that loops back counts each item once", () => {
  const a = make({ description: "A", blockedBy: "C" });
  const b = make({ description: "B", blockedBy: "A" });
  const c = make({ description: "C", blockedBy: "B" });
  const all = [a, b, c];
  const blocksMap = new Map(all.map((x) => [x, blockedItems(x, all)]));
  assert.deepEqual(downstreamItems(blocksMap.get(a), blocksMap, a).map((x) => x.description), ["C"]);
});

test("item title is text before first comma", () => {
  assert.equal(itemTitle("Lease renewal, still waiting on redlines"), "lease renewal");
  assert.equal(itemTitle("Lease  renewal, countersigned, resolved"), "lease renewal");
  assert.equal(itemTitle("Board pack legal review"), "board pack legal review");
});

test("blocked items are neither stale nor overdue", () => {
  // One root cause, listed once: on the blocker's card.
  const blocker = make({ description: "Fix alerting", dueDate: TODAY - 9, lastUpdated: TODAY - 9 });
  const waiting = make({ description: "Rewrite SOP, draft started", blockedBy: "Fix alerting",
    dueDate: TODAY - 2, lastUpdated: TODAY - 20 });
  const everything = [blocker, waiting];
  assert.ok(isStale(blocker, TODAY, everything) && isOverdue(blocker, TODAY, everything));
  assert.ok(!isStale(waiting, TODAY, everything));
  assert.ok(!isOverdue(waiting, TODAY, everything));
});

test("a pending decision is never stale", () => {
  // Its wait is measured by the pending clock, not blamed on the owner.
  const item = make({ status: "pending_decision", decisionPending: true, lastUpdated: TODAY - 30 });
  assert.ok(!isStale(item, TODAY, [item]));
});

// --- Owner names ---------------------------------------------------------------------

import { AliasTable } from "../app/engine/normalize.js";
import { findConflicts } from "../app/engine/rules.js";

const OWNERS = [
  { raw_name: "Priya Nair", area: "", normalized_owner: "Priya Nair" },
  { raw_name: "P. Nair", area: "", normalized_owner: "Priya Nair" },
  { raw_name: "Rahul Mehta", area: "", normalized_owner: "Rahul Mehta" },
  { raw_name: "Raj Mehta", area: "", normalized_owner: "Raj Mehta" },
];

test("another spelling on file merges, and reveals a clash", () => {
  const aliases = new AliasTable(OWNERS);
  const a = make({ owner: aliases.resolve("Priya Nair", "Eats"), dueDate: TODAY + 3 });
  const b = make({ owner: aliases.resolve("P. Nair", "Mart"), dueDate: TODAY + 4 });
  assert.equal(b.owner, "Priya Nair");
  assert.equal(findConflicts([a, b]).length, 1);
});

test("similar names on file stay two people", () => {
  const aliases = new AliasTable(OWNERS);
  assert.notEqual(aliases.resolve("Rahul Mehta", ""), aliases.resolve("Raj Mehta", ""));
});

test("a spelling nobody has confirmed is reported, not guessed", () => {
  const aliases = new AliasTable(OWNERS);
  assert.equal(aliases.resolve("P Nair", "Mart"), "P Nair");
  assert.deepEqual(aliases.unresolved, [["P Nair", "Mart"]]);
});
