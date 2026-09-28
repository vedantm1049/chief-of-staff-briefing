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
import { needsDeadlineSet, itemTitle, isStale, isOverdue } from "../app/engine/rules.js";
import { day } from "../app/engine/dates.js";

const TODAY = day(2026, 9, 28);   // a Monday

function make(fields) {
  return makeCommitment({ unit: "Wasla Pay", rawOwner: "X", owner: "X", statusRaw: "Open", lastUpdated: TODAY, ...fields });
}

for (const [raw, expected] of [
  ["done", "done"], ["Done", "done"], ["complete", "done"], [" Completed ", "done"],
  ["Pending Decision", "pending_decision"], ["in progress", "open"], ["Open", "open"],
  ["", null], [null, null],
]) {
  test(`mart status vocabulary [${JSON.stringify(raw)}]`, () => {
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
  // Closed vocabulary catches a decision in a unit with no status column.
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

test("overdue decision is urgent even if recently pending", () => {
  // Urgency signals are OR'd for every item. A decision 4 days overdue that
  // entered Pending Decision only 2 days ago is still urgent.
  const item = make({ unit: "Wasla Eats", status: "pending_decision", decisionPending: true,
    dueDate: TODAY - 4, lastUpdated: TODAY - 2 });
  const classified = classifyCommitment(item, TODAY, [], new Set());
  assert.ok(classified.urgency);
  assert.equal(classified.quadrant, QUADRANT_NEEDS_DECISION_NOW);
});

test("core and experimental tiers score the same", () => {
  // Known simplification: only Flagship lifts importance.
  for (const unit of ["Wasla Pay", "Wasla Express"]) {
    const c = classifyCommitment(make({ unit }), TODAY, [], new Set());
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
  const blocker = make({ unit: "Wasla Pay" });
  const one = classifyCommitment(blocker, TODAY, [make({})], new Set());
  const two = classifyCommitment(blocker, TODAY, [make({}), make({})], new Set());
  assert.ok(!one.importance);
  assert.ok(two.importance && two.importanceReasons.includes("blocks 2 other open items"));
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
