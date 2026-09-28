/* Notes, owner emails, email drafts and replies. Not a scoring rule, so no
row in docs/dataset_key.md. Nothing here changes how an item is scored.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import { newNote, notesFor, cleanNotes, emailDraft } from "../app/ui/notes.js";
import { backupBlob, parseBackup } from "../app/ui/store.js";
import { loadSample, history, findCommitment, W2, W3, W4 } from "./helpers.js";

const sample = await loadSample();
const weeks = history(sample);

const LEASE = { unit: "Wasla Table", title: "review and countersign downtown dubai flagship lease renewal",
  label: "Review and countersign Downtown Dubai flagship lease renewal", owner: "Layla Haddad" };

test("owner emails come from the alias table", () => {
  const b = weeks[W4];
  assert.equal(b.ownerEmails.get("Priya Nair"), "priya.nair@wasla.example");
  assert.equal(b.ownerEmails.get("Zayd"), "zayd@wasla.example");
});

test("a name missing from the alias table has no email", () => {
  // "L. Haddad" is unresolved in week 4, so no email is guessed for it.
  assert.equal(weeks[W4].ownerEmails.get("L. Haddad"), undefined);
});

test("a note stays with its item from the week it was written", () => {
  const note = newNote({ ...LEASE, from: "CEO", text: "Who is chasing the landlord?", week: W2 });
  assert.deepEqual(notesFor([note], LEASE.unit, LEASE.title, W2), [note]);
  assert.deepEqual(notesFor([note], LEASE.unit, LEASE.title, W3), [note]);
  assert.deepEqual(notesFor([note], LEASE.unit, LEASE.title, "2026-09-27"), []);
});

test("the email draft carries the note and the card's facts, nothing more", () => {
  const b = weeks[W2];
  const item = findCommitment(b, { owner: "Layla Haddad", unit: "Wasla Table" });
  const note = newNote({ ...LEASE, from: "CEO", text: "Who is chasing the landlord?", week: W2 });
  const href = emailDraft({ to: "layla.haddad@wasla.example", owner: "Layla Haddad", item, note,
    weekEnding: W2, flags: ["Overdue"] });
  const url = new URL(href);
  assert.equal(url.protocol, "mailto:");
  assert.equal(decodeURIComponent(url.pathname), "layla.haddad@wasla.example");
  const body = url.searchParams.get("body");
  assert.equal(url.searchParams.get("subject"), "Briefing: Review and countersign Downtown Dubai flagship lease renewal");
  assert.deepEqual(body.split("\n"), [
    "Hi Layla,",
    "",
    "From the CEO: Who is chasing the landlord?",
    "",
    "Item: Review and countersign Downtown Dubai flagship lease renewal, still waiting on redlines from landlord's counsel",
    "Unit: Wasla Table",
    "Due: Tue 29 Sep 2026",
    "Flagged: Overdue",
    "",
    "From the weekly briefing, week ending Sun 4 Oct 2026.",
  ]);
});

test("the chief of staff is copied on every draft", () => {
  const b = weeks[W2];
  const item = findCommitment(b, { owner: "Layla Haddad", unit: "Wasla Table" });
  const note = newNote({ ...LEASE, from: "CEO", text: "Status?", week: W2 });
  const draft = (to, cc) => new URL(emailDraft({ to, cc, owner: "Layla Haddad", item, note, weekEnding: W2, flags: [] }));
  assert.equal(draft("layla.haddad@wasla.example", "chief.of.staff@wasla.example").searchParams.get("cc"),
    "chief.of.staff@wasla.example");
  // Not copied on an email to themselves, and never on a malformed address.
  assert.equal(draft("chief.of.staff@wasla.example", "Chief.of.Staff@wasla.example").searchParams.get("cc"), null);
  assert.equal(draft("layla.haddad@wasla.example", "not an email").searchParams.get("cc"), null);
});

test("notes and replies survive a backup and import", async () => {
  const note = { ...newNote({ ...LEASE, from: "Chief of Staff", text: "Chased twice", week: W3 }),
    emailed: true, reply: { text: "Redlines due Monday", at: "2026-10-12T09:00:00Z" } };
  const back = parseBackup(await backupBlob([], [note], { cosEmail: "cos@example.com" }).text());
  assert.deepEqual(back.notes, [note]);
  assert.equal(back.settings.cosEmail, "cos@example.com");
});

test("a damaged note is dropped, not trusted", () => {
  const good = newNote({ ...LEASE, from: "CEO", text: "ok", week: W3 });
  const kept = cleanNotes([good, { id: "x", text: "no unit" }, null, { ...good, id: "y", week: "soon", from: "Board" }]);
  assert.deepEqual(kept.map((n) => n.id), [good.id]);
});
