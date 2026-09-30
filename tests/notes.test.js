/* Notes, owner emails, email drafts and replies. Not a scoring rule, so no
row in docs/dataset_key.md. Nothing here changes how an item is scored.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import { newNote, notesFor, cleanNotes, emailDraft } from "../app/ui/notes.js";
import { backupBlob, parseBackup } from "../app/ui/store.js";
import { loadExample, history, byId, W2, W3, W4 } from "./helpers.js";

const weeks = history(await loadExample());

// Notes on a task kept on the page follow its id.
const ICE_CREAM = { id: "t-icecream", taskId: "t-icecream", area: "Wasla Central",
  title: "finish and launch the ice-cream summer campaign", label: "Finish and launch the ice-cream summer campaign",
  owner: "Priya Nair" };

test("owner emails come from the people list", () => {
  const b = weeks[W4];
  assert.equal(b.ownerEmails.get("Priya Nair"), "priya.nair@wasla.example");
  assert.equal(b.ownerEmails.get("Zayd"), "zayd@wasla.example");
});

test("a name nobody has said who it is gets no email", () => {
  assert.equal(weeks[W4].ownerEmails.get("P Nair"), undefined);
});

test("a note stays with its item from the week it was written", () => {
  const note = newNote({ ...ICE_CREAM, from: "boss", text: "Which option costs least?", week: W2 });
  assert.deepEqual(notesFor([note], ICE_CREAM, W2), [note]);
  assert.deepEqual(notesFor([note], ICE_CREAM, W3), [note]);
  assert.deepEqual(notesFor([note], ICE_CREAM, "2026-09-27"), []);
  // By id: a renamed task keeps its notes.
  assert.deepEqual(notesFor([note], { ...ICE_CREAM, title: "renamed" }, W3), [note]);
});

test("the email draft carries the note and the card's facts, nothing more", () => {
  const item = byId(weeks[W2], "t-icecream");
  const note = newNote({ ...ICE_CREAM, from: "boss", text: "Which option costs least?", week: W2 });
  const href = emailDraft({ to: "priya.nair@wasla.example", owner: "Priya Nair", item, note,
    weekEnding: W2, flags: ["Decision pending", "Overdue"], areaKind: "business" });
  const url = new URL(href);
  assert.equal(url.protocol, "mailto:");
  assert.equal(decodeURIComponent(url.pathname), "priya.nair@wasla.example");
  assert.equal(url.searchParams.get("subject"), "Briefing: Finish and launch the ice-cream summer campaign");
  assert.deepEqual(url.searchParams.get("body").split("\n"), [
    "Hi Priya,",
    "",
    "From the CEO: Which option costs least?",
    "",
    "Item: Finish and launch the ice-cream summer campaign, three options for the CEO",
    "Business: Wasla Central",
    "Due: Tue 15 Sep 2026",
    "Flagged: Decision pending, Overdue",
    "",
    "From the weekly briefing, week ending Sun 4 Oct 2026.",
  ]);
});

test("the chief of staff is copied on every draft", () => {
  const item = byId(weeks[W2], "t-icecream");
  const note = newNote({ ...ICE_CREAM, from: "boss", text: "Status?", week: W2 });
  const draft = (to, cc) => new URL(emailDraft({ to, cc, owner: "Layla Haddad", item, note, weekEnding: W2, flags: [] }));
  assert.equal(draft("layla.haddad@wasla.example", "chief.of.staff@wasla.example").searchParams.get("cc"),
    "chief.of.staff@wasla.example");
  // Not copied on an email to themselves, and never on a malformed address.
  assert.equal(draft("chief.of.staff@wasla.example", "Chief.of.Staff@wasla.example").searchParams.get("cc"), null);
  assert.equal(draft("layla.haddad@wasla.example", "not an email").searchParams.get("cc"), null);
});

test("notes and replies survive a backup and import", async () => {
  const note = { ...newNote({ ...ICE_CREAM, from: "Chief of Staff", text: "Chased twice", week: W3 }),
    emailed: true, reply: { text: "Redlines due Monday", at: "2026-10-12T09:00:00Z" } };
  const example = await loadExample();
  const back = parseBackup(await backupBlob("example", { ...example, notes: [note], settings: { cosEmail: "cos@example.com" } }).text());
  assert.equal(back.id, "example");
  assert.deepEqual(back.state.notes, [note]);
  assert.equal(back.state.settings.cosEmail, "cos@example.com");
});

test("a damaged note is dropped, not trusted", () => {
  const good = newNote({ ...ICE_CREAM, from: "boss", text: "ok", week: W3 });
  const kept = cleanNotes([good, { id: "x", text: "no area" }, null, { ...good, id: "y", week: "soon", from: "Board" }]);
  assert.deepEqual(kept.map((n) => n.id), [good.id]);
});

test("notes speak of the boss by the title in setup", async () => {
  const { fromLabel } = await import("../app/ui/notes.js");
  const item = byId(weeks[W2], "t-icecream");
  const note = newNote({ ...ICE_CREAM, from: "boss", text: "Go with two.", week: W2 });
  const body = new URL(emailDraft({ to: "priya.nair@wasla.example", owner: "Priya Nair", item, note, weekEnding: W2,
    flags: [], boss: "Managing Director" })).searchParams.get("body");
  assert.match(body, /From the Managing Director: Go with two\./);
  assert.equal(fromLabel("boss", "Managing Director"), "Managing Director");
  assert.equal(fromLabel("cos", "Managing Director"), "Chief of Staff");
  // Notes saved before roles keep their meaning.
  assert.deepEqual(cleanNotes([{ ...note, from: "CEO" }, { ...note, id: "n2", from: "Chief of Staff" }]).map((n) => n.from), ["boss", "cos"]);
});
