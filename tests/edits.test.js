/* The reader's own changes: ticking an item done or changing its due date.
Not a scoring rule, so no row in docs/dataset_key.md. An edit applies to the
week it was made in; the next week's files win.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHistory } from "../app/engine/history.js";
import { QUADRANT_NEEDS_DECISION_NOW } from "../app/engine/classify.js";
import { day, toIso } from "../app/engine/dates.js";
import { loadSample, findCommitment, W3, W4 } from "./helpers.js";

const sample = await loadSample();

function withEdits(edits) {
  return Object.fromEntries(buildHistory(sample.weeks, { aliasText: sample.aliasText, edits })
    .map((b) => [toIso(b.weekEnding), b]));
}

const RAJ = { area: "Wasla Pay", title: "waiting on ceo sign-off to extend acquiring-bank contract by 12 months" };

test("ticking an item done takes it off the briefing and closes it as done", () => {
  const b = withEdits({ [W4]: [{ ...RAJ, done: true }] })[W4];
  const raj = findCommitment(b, { owner: "Raj Mehta", descriptionContains: "acquiring-bank" });
  assert.equal(raj.status, "done");
  assert.ok(!b.classified.has(raj));
  const x = b.comparison.closed.find((c) => c.before.owner === "Raj Mehta");
  assert.equal(x.outcome, "done");
  assert.equal(x.detail, "Marked done by you on this page.");
});

test("an edit applies to its own week only", () => {
  // Ticked done in week 3, still open in week 4's files: new data wins.
  const weeks = withEdits({ [W3]: [{ ...RAJ, done: true }] });
  const raj = findCommitment(weeks[W4], { owner: "Raj Mehta", descriptionContains: "acquiring-bank" });
  assert.equal(raj.status, "pending_decision");
  assert.equal(weeks[W4].classified.get(raj).quadrant, QUADRANT_NEEDS_DECISION_NOW);
});

test("a changed due date is rescored and noted", () => {
  // Mina's item, due "next Tuesday" (20 Oct) in week 4. Moved to 1 Nov it is
  // no longer due within 3 days, but the rating miss keeps it important.
  const edits = { [W4]: [{ area: "Wasla Express", title: "mall-retail partner integration testing", due: "2026-11-01" }] };
  const b = withEdits(edits)[W4];
  const mina = findCommitment(b, { owner: "Mina" });
  assert.equal(mina.dueDate, day(2026, 11, 1));
  assert.equal(mina.dueDateApprox, false);
  assert.equal(mina.edited.dueFrom, "next Tuesday");
  assert.ok(!b.classified.get(mina).urgencyReasons.some((r) => r.startsWith("due in")));
});

test("an edit naming no item changes nothing", () => {
  const b = withEdits({ [W4]: [{ area: "Wasla Pay", title: "no such item", done: true }] })[W4];
  assert.ok(b.allCommitments.every((c) => c.edited == null));
});
