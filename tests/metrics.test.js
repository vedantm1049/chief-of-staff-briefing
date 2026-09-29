/* The metric rule: every metric an area tracks, against its own target, in
the direction it counts as good. Rows for the example are in
docs/dataset_key.md; the rest are cases the example doesn't contain.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateMetrics } from "../app/engine/metrics.js";
import { METRIC_SUGGESTIONS } from "../app/engine/config.js";
import { loadSample, history, W1, W2, W3, W4 } from "./helpers.js";

const suggested = (name, fields) => ({ ...METRIC_SUGGESTIONS.find((m) => m.name === name), ...fields });
const area = (metrics) => [{ name: "Sales team", tier: "Core", metrics }];
const one = (metrics, rows) => evaluateMetrics(area(metrics), rows.map((r) => ({ area: "Sales team", ...r })));

test("example: only the designed metric misses trigger", async () => {
  const weeks = history(await loadSample());
  const misses = (w) => weeks[w].metricResults.filter((r) => r.triggered).map((r) => `${r.area}: ${r.metric}`);
  assert.deepEqual(misses(W1), ["Wasla Mart: Customer rating"]);
  assert.deepEqual(misses(W2), ["Wasla Mart: Customer rating"]);
  assert.deepEqual(misses(W3), ["Wasla Mart: Customer rating"]);
  assert.deepEqual(misses(W4), ["Wasla Express: Customer rating"]);
  for (const w of [W1, W2, W3, W4]) assert.ok(weeks[w].metricResults.every((r) => r.reported));
});

test("example: every business reports the metrics set for it", async () => {
  const b = history(await loadSample())[W1];
  const byArea = {};
  for (const r of b.metricResults) (byArea[r.area] ??= []).push(r.metric);
  assert.deepEqual(byArea["Wasla Pay"], ["Transactions", "Dispute rate", "Customer rating"]);
  assert.deepEqual(byArea["Wasla Central"], ["Roadmap items shipped"]);
});

test("a percent margin: more than 5% short is a miss", () => {
  const sales = suggested("Sales", { target: 100000 });
  assert.equal(one([sales], [{ metric: "Sales", value: 95000 }])[0].triggered, false);
  const [r] = one([sales], [{ metric: "Sales", value: 94000 }]);
  assert.ok(r.triggered);
  assert.equal(r.reason, "6.0% below target, more than the 5% margin");
});

test("lower is better: costs over target are the miss", () => {
  const costs = suggested("Costs", { target: 50000 });
  assert.equal(one([costs], [{ metric: "Costs", value: 40000 }])[0].reason, "on or better than target");
  const [r] = one([costs], [{ metric: "Costs", value: 60000 }]);
  assert.ok(r.triggered);
  assert.match(r.reason, /above target/);
});

test("a points margin on a percentage", () => {
  const churn = suggested("Customer churn", { target: 2 });
  assert.equal(one([churn], [{ metric: "Customer churn", value: 2.4 }])[0].reason, "within 0.5 points of target");
  assert.ok(one([churn], [{ metric: "Customer churn", value: 2.6 }])[0].triggered);
});

test("a rating on too few responses is not judged", () => {
  const rating = suggested("Customer rating", { target: 4.5 });
  assert.ok(one([rating], [{ metric: "Customer rating", value: 3.0, count: 9 }])[0].lowSample);
  assert.ok(one([rating], [{ metric: "Customer rating", value: 3.0 }])[0].lowSample);
  assert.ok(one([rating], [{ metric: "Customer rating", value: 3.0, count: 10 }])[0].triggered);
});

test("a metric with no number this week is shown as not reported", () => {
  const [r] = one([suggested("Orders", { target: 10 })], []);
  assert.equal(r.reported, false);
  assert.equal(r.reason, "not reported this week");
  assert.equal(r.triggered, false);
});

test("several rows without counts add up", () => {
  const [r] = one([suggested("Sales", { target: 100 })],
    [{ metric: "Sales", segment: "North", value: 40 }, { metric: "sales", segment: "South", value: 70 }]);
  assert.equal(r.value, 110);
  assert.equal(r.segments.length, 2);
});

test("a row for a metric setup doesn't track is ignored", () => {
  const results = one([suggested("Orders", { target: 10 })], [{ metric: "Orders", value: 12 }, { metric: "Mood", value: 1 }]);
  assert.deepEqual(results.map((r) => r.metric), ["Orders"]);
});

test("a target sent with the number is used over the setup target", () => {
  // The example's ratings carry their target on each row. A leader's sheet
  // never does: its targets are read from setup (weekly.readMetricSheet).
  const [r] = one([suggested("Orders", { target: 100 })], [{ metric: "Orders", value: 90, target: 80 }]);
  assert.equal(r.target, 80);
  assert.equal(r.triggered, false);
});
