/* The weekly routine for your own company: setup, the sheets each leader and
person fills in, reading them back, requests and the reminder. Not scoring
rules, so no rows in docs/dataset_key.md.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import * as weekly from "../app/ui/weekly.js";
import { readTables, likelyMatches } from "../app/ui/intake.js";
import { cleanWorkspace, backupBlob, parseBackup } from "../app/ui/store.js";
import { buildHistory } from "../app/engine/history.js";
import { METRIC_SUGGESTIONS } from "../app/engine/config.js";
import { QUADRANT_NEEDS_DECISION_NOW } from "../app/engine/classify.js";

const suggested = (name, fields) => ({ ...METRIC_SUGGESTIONS.find((m) => m.name === name), ...fields });

function company() {
  return cleanWorkspace("own", {
    setup: {
      company: "Acme", areaKind: "department", boss: "Managing Director",
      areas: [
        { name: "Sales", tier: "Flagship", leader: { name: "Priya Nair", email: "priya@acme.example" },
          metrics: [suggested("Sales", { target: 100000 }), suggested("Customer rating", { target: 4.5 })] },
        { name: "Finance", tier: "Core", leader: { name: "Omar Ali", email: "omar@acme.example" },
          metrics: [suggested("Costs", { target: 50000 })] },
      ],
    },
    people: [
      { name: "Priya Nair", email: "priya@acme.example", area: "Sales" },
      { name: "Omar Ali", email: "omar@acme.example", area: "Finance" },
    ],
    tasks: [
      { id: "t1", area: "Sales", task: "Approve discount policy", owner: "Priya Nair", due_date: "2026-10-05",
        status: "Waiting on decision", waiting_on: "Managing Director", decision_type: "Yes or no", last_updated: "2026-09-20" },
      { id: "t2", area: "Finance", task: "Close September books", owner: "Omar Ali", due_date: "2026-09-25",
        status: "In progress", last_updated: "2026-09-10" },
    ],
  });
}

const tableOf = (bytes, name = "x.xlsx") => readTables(name, bytes)[0];

test("setup keeps each area's leader and metrics", () => {
  const own = company();
  assert.equal(own.setup.areas[0].leader.email, "priya@acme.example");
  assert.deepEqual(own.setup.areas[0].metrics.map((m) => m.name), ["Sales", "Customer rating"]);
  assert.equal(own.setup.areas[1].metrics[0].better, "lower");
});

test("a leader's sheet lists only their area's metrics, and reads back", () => {
  const own = company();
  const table = tableOf(weekly.metricSheet(own.setup.areas[0]));
  assert.equal(weekly.sheetKind(table.headers), "metrics");
  assert.deepEqual(table.rows.map((r) => r.metric), ["Sales", "Customer rating"]);
  table.rows[0].value = "93000";
  table.rows[1].value = "4.6";
  table.rows[1].count = "40";
  const { rows, areas, unknown } = weekly.readMetricSheet(table, own.setup);
  assert.deepEqual(areas, ["Sales"]);
  assert.deepEqual(unknown, []);
  assert.equal(rows[0].target, "");   // targets come from setup, never the returned file
});

test("a week scores the live tasks and the metrics sent back", () => {
  const own = weekly.startWeek(company(), "2026-09-27");
  const table = tableOf(weekly.metricSheet(own.setup.areas[0]));
  table.rows[0].value = "93000";   // 7% short of 100,000: a miss
  own.weeks[0].metrics = weekly.readMetricSheet(table, own.setup).rows;
  const [b] = buildHistory(weekly.weeksForEngine(own), { setup: own.setup, aliases: weekly.peopleRows(own.people) });
  const sales = b.metricResults.find((r) => r.metric === "Sales");
  assert.ok(sales.triggered);
  assert.equal(b.metricResults.find((r) => r.metric === "Customer rating").reported, false);
  const decision = b.allCommitments.find((c) => c.id === "t1");
  assert.ok(decision.principalBlocked);
  assert.equal(b.classified.get(decision).quadrant, QUADRANT_NEEDS_DECISION_NOW);
});

test("starting the next week freezes the last one and drops done tasks", () => {
  const own = weekly.startWeek(company(), "2026-09-27");
  own.tasks[1].status = "Done";
  weekly.startWeek(own, "2026-10-04");
  assert.equal(own.weeks[0].tasks.length, 2);
  assert.deepEqual(own.tasks.map((t) => t.id), ["t1"]);
  assert.equal(own.weeks[1].tasks, null);
  assert.throws(() => weekly.startWeek(own, "2026-09-27"), /Weeks go forward/);
  const weeks = buildHistory(weekly.weeksForEngine(own), { setup: own.setup, aliases: weekly.peopleRows(own.people) });
  assert.equal(weeks.length, 2);
});

test("a person's sheet round trip: an update, a new task, a deleted row", () => {
  const own = company();
  own.tasks.push({ id: "t3", area: "Finance", task: "Vendor audit", owner: "Omar Ali", due_date: "", status: "Open",
    waiting_on: "", blocked_by: "", decision_type: "", last_updated: "2026-09-01" });
  const table = tableOf(weekly.taskSheet(own, own.people[1]));
  assert.equal(weekly.sheetKind(table.headers), "tasks");
  assert.deepEqual(table.rows.map((r) => r.id), ["t2", "t3"]);
  table.rows[0].status = "Done";
  table.rows.splice(1, 1);   // they deleted the vendor audit row
  table.rows.push({ id: "", area: "", task: "Audit prep", owner: "Omar Ali", due_date: "2026-10-20", status: "Open" });
  const diff = weekly.diffTaskSheet(own, table, "2026-09-29");
  assert.equal(diff.person.name, "Omar Ali");
  assert.deepEqual(diff.updated.map((u) => u.changed), [["status"]]);
  assert.equal(diff.updated[0].after.last_updated, "2026-09-29");   // changed, so touched today
  assert.equal(diff.added[0].area, "Finance");
  assert.deepEqual(diff.removed.map((t) => t.id), ["t3"]);
  weekly.applyTaskDiff(own, diff);
  assert.equal(own.tasks.find((t) => t.id === "t2").status, "Done");
  assert.ok(!own.tasks.some((t) => t.id === "t3"));
  assert.ok(own.tasks.some((t) => t.task === "Audit prep"));
});

test("a sheet with no rows left can't say whose it is, so it changes nothing", () => {
  const own = company();
  const diff = weekly.diffTaskSheet(own, { headers: weekly.TASK_SHEET_COLUMNS, rows: [] }, "2026-09-29");
  assert.equal(diff.person, null);
});

test("an unchanged row keeps its last-updated date", () => {
  const own = company();
  const diff = weekly.diffTaskSheet(own, tableOf(weekly.taskSheet(own, own.people[1])), "2026-09-29");
  assert.equal(diff.updated.length, 0);
  assert.equal(diff.unchanged, 1);
});

test("requests: the metric numbers, due Wednesday, from your own email app", () => {
  const own = company();
  const url = new URL(weekly.metricRequest(own.setup.areas[0], "2026-09-27"));
  assert.equal(decodeURIComponent(url.pathname), "priya@acme.example");
  const body = url.searchParams.get("body");
  assert.match(body, /by Wed 30 Sep 2026/);
  assert.match(body, /- Sales, target 100,000/);
  assert.match(body, /- Customer rating \(out of 5\), target 4\.5, and how many responses/);
  const tasks = new URL(weekly.taskRequest(own, own.people[1], "2026-09-27")).searchParams.get("body");
  assert.match(tasks, /- Close September books, due 2026-09-25, In progress/);
});

test("the Monday reminder invites every leader and person once", () => {
  const own = company();
  const ics = weekly.reminderIcs(own, "cos@acme.example", new Date(2026, 8, 29));
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO/);
  assert.match(ics, /DTSTART:20261005T090000/);
  assert.equal(ics.match(/ATTENDEE/g).length, 2);
  const link = new URL(weekly.reminderGoogleLink(own, "cos@acme.example", new Date(2026, 8, 29)));
  assert.equal(link.searchParams.get("add"), "priya@acme.example,omar@acme.example");
});

test("a new name is offered likely matches, never merged", () => {
  const people = [{ name: "Priya Nair" }, { name: "Rahul Mehta" }];
  assert.deepEqual(likelyMatches("P. Nair", people).map((p) => p.name), ["Priya Nair"]);
  assert.deepEqual(likelyMatches("Sara Khan", people), []);
});

test("your company's backup carries setup, people, tasks and weeks", async () => {
  const own = weekly.startWeek(company(), "2026-09-27");
  const back = parseBackup(await backupBlob("own", own).text());
  assert.equal(back.id, "own");
  assert.deepEqual(back.state, own);
});

test("each leader is also a person who can own tasks", () => {
  const own = company();
  own.people = [{ name: "Priya Nair", email: "", area: "", spellings: [] }];
  weekly.syncLeaders(own);
  assert.deepEqual(own.people.map((p) => [p.name, p.email, p.area]), [
    ["Priya Nair", "priya@acme.example", "Sales"],
    ["Omar Ali", "omar@acme.example", "Finance"],
  ]);
});

test("targets can be typed with commas or spaces", () => {
  const own = cleanWorkspace("own", { setup: { areas: [{ name: "Sales", metrics: [
    { name: "Sales", target: "1,200,000", margin: " 5 " }, { name: "Costs", target: "50 000" }] }] } });
  assert.deepEqual(own.setup.areas[0].metrics.map((m) => [m.target, m.margin]), [[1200000, 5], [50000, 5]]);
});
