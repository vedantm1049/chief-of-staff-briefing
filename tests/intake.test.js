/* Setting up for your own company: reading what the teams sent, matching
columns, asking about new names, and keeping it all in one browser. Not
scoring rules, so no rows in docs/dataset_key.md.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import * as intake from "../app/ui/intake.js";
import { backupBlob, parseBackup, cleanWorkspace } from "../app/ui/store.js";
import { buildBriefing } from "../app/engine/briefing.js";
import { QUADRANT_NEEDS_DECISION_NOW } from "../app/engine/classify.js";

const SETUP = {
  company: "Acme", areaKind: "department", boss: "Managing Director",
  areas: [{ name: "Sales", tier: "Flagship" }, { name: "Finance", tier: "Core" }],
};
const OWNERS = [
  { name: "Priya Nair", email: "priya@acme.example", spellings: [] },
  { name: "Rahul Mehta", email: "", spellings: [] },
];

test("a template file needs no matching", () => {
  const [t] = intake.readTables("tasks.csv",
    "area,task,owner,due_date,status,waiting_on,blocked_by,decision_type,last_updated\nSales,Q4 plan,Priya Nair,2026-10-02,Open,,,,2026-09-20\n");
  assert.ok(intake.isTemplate(t.headers, "tasks"));
  assert.equal(intake.guessKind(t.headers), "tasks");
});

test("a team's own columns are matched by their usual names", () => {
  const [t] = intake.readTables("finance.csv", "Assignee,Description,Deadline,State,Last update\nP. Nair,Close books,2026-10-01,in progress,2026-09-10\n");
  const columns = intake.autoMatch(t.headers, "tasks");
  assert.deepEqual(columns, { task: "Description", owner: "Assignee", due_date: "Deadline", status: "State", last_updated: "Last update" });
  // No area column: the reader says which area the whole file is for.
  assert.deepEqual(intake.mappingProblems({ kind: "tasks", columns }, "tasks"),
    ["Pick the column for Area, or say which area this whole file is for."]);
  const rows = intake.applyMapping(t, { kind: "tasks", columns, area: "Finance" });
  assert.equal(rows[0].area, "Finance");
  assert.equal(rows[0].owner, "P. Nair");
});

test("a table pasted from a spreadsheet is read by its tabs", () => {
  const [t] = intake.readTables("Pasted table", "Task\tOwner\nHire, then train\tRahul Mehta\n");
  assert.deepEqual(t.headers, ["Task", "Owner"]);
  assert.equal(t.rows[0].Task, "Hire, then train");
});

test("the same columns are remembered by their signature", () => {
  assert.equal(intake.signature(["Due Date", "Owner", "task"]), intake.signature(["task", "owner", "due-date"]));
});

test("a new name is asked about, never matched on its own", () => {
  const rows = [{ owner: "P. Nair" }, { owner: "Priya Nair" }, { owner: "Raj Mehta" }];
  assert.deepEqual(intake.newOwnerNames(rows, OWNERS), ["P. Nair", "Raj Mehta"]);
  // Offered first for the reader to check, not chosen: shares a surname and an initial.
  assert.deepEqual(intake.likelyMatches("P. Nair", OWNERS).map((o) => o.name), ["Priya Nair"]);
  // Shares a surname, so listed first, but the reader decides. Nothing is merged here.
  assert.deepEqual(intake.likelyMatches("Raj Mehta", OWNERS).map((o) => o.name), ["Rahul Mehta"]);
});

test("an area outside the setup is asked about", () => {
  assert.deepEqual(intake.unknownAreaNames([{ area: "sales" }, { area: "Ops" }], SETUP.areas), ["Ops"]);
});

test("templates carry the reader's areas", () => {
  const files = intake.templateFiles(SETUP);
  assert.equal(files["tasks-template.csv"].split("\n")[1], "Sales,,,,,,,,");
  assert.equal(files["metrics-template.csv"].split("\n")[2], "Finance,Customer rating,,,,");
});

test("your own company is scored with your setup", () => {
  // A decision waiting on the Managing Director, in the team's own columns,
  // with the owner under another spelling the reader already confirmed.
  const [t] = intake.readTables("sales.csv",
    "Dept,Item,Owner,Due,Status,Waiting for,Decision,Updated\nSales,Approve discount policy,P. Nair,2026-10-05,Waiting on decision,Managing Director,Yes or no,2026-09-20\n");
  const mapping = { kind: "tasks", columns: intake.autoMatch(t.headers, "tasks"), area: "" };
  const owners = [{ ...OWNERS[0], spellings: ["P. Nair"] }];
  const b = buildBriefing({ weekEnding: "2026-09-27", tasks: intake.applyMapping(t, mapping), metrics: [] },
    { setup: SETUP, aliases: intake.ownerRows(owners) });
  const [item] = b.allCommitments;
  assert.equal(item.owner, "Priya Nair");
  assert.ok(item.principalBlocked);
  assert.equal(b.classified.get(item).quadrant, QUADRANT_NEEDS_DECISION_NOW);
  assert.equal(b.ownerEmails.get("Priya Nair"), "priya@acme.example");
});

test("your company's backup carries setup, weeks and matches", async () => {
  const state = cleanWorkspace("own", {
    setup: SETUP, owners: OWNERS,
    weeks: [{ weekEnding: "2026-09-27", tasks: [{ area: "Sales", task: "Q4 plan", owner: "Priya Nair" }], metrics: [], files: ["sales.csv"] }],
    mappings: { "a|b": { kind: "tasks", columns: { task: "b" }, area: "Sales" } },
  });
  const back = parseBackup(await backupBlob("own", state).text());
  assert.equal(back.id, "own");
  assert.deepEqual(back.state, state);
});

test("a backup from before workspaces goes to the example", () => {
  const old = JSON.stringify({ format: "chief-of-staff-briefing backup", version: 2, edits: [], notes: [] });
  assert.equal(parseBackup(old).id, "example");
});
