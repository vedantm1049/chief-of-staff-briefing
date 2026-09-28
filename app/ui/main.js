/* Loads the Wasla sample, scores all four weeks in the browser, and redraws
the page whenever the reader switches week or changes an item.
*/
import { loadDataFolder } from "../engine/sample.js";
import { buildHistory } from "../engine/history.js";
import { WASLA_UNITS } from "../engine/config.js";
import { toIso } from "../engine/dates.js";
import * as store from "./store.js";
import { newNote } from "./notes.js";
import { renderPage, esc } from "./render.js";

const DATA = "data/";
const root = document.getElementById("app");
const tiers = Object.fromEntries(WASLA_UNITS.map((u) => [u.name, u.tier]));

let sample = null;
let briefings = [];
let week = null;       // the week ending being shown, "YYYY-MM-DD"
let edits = [];
let notes = [];
let saved = true;
let message = "";

async function read(rel, kind) {
  const res = await fetch(DATA + rel);
  if (!res.ok) throw new Error(`${rel} returned ${res.status}`);
  return kind === "bytes" ? new Uint8Array(await res.arrayBuffer()) : res.text();
}

function weekFromHash() {
  const m = /week=(\d{4}-\d{2}-\d{2})/.exec(location.hash);
  return m ? m[1] : null;
}

function rescore() {
  briefings = buildHistory(sample.weeks, { aliasText: sample.aliasText, edits: store.byWeek(edits) });
}

function draw() {
  const isos = briefings.map((b) => toIso(b.weekEnding));
  if (!isos.includes(week)) week = isos.at(-1);
  const current = briefings[isos.indexOf(week)];
  root.innerHTML = renderPage({
    briefings, current, tiers, edits, notes, saved, message,
    weekEdits: edits.filter((e) => e.week === week),
  });
  document.title = `Wasla Group briefing, week ending ${week}`;
}

function change(next, note = "") {
  edits = next;
  commit(note);
}

function changeNotes(next, note = "") {
  notes = next;
  commit(note, false);
}

/** Save everything; rescore only when an edit could move an item. */
function commit(note, rescoreToo = true) {
  const ok = store.save(edits, notes);
  if (saved && !ok) saved = false;
  message = note;
  if (rescoreToo) rescore();
  draw();
}

function updateNote(id, fn) {
  changeNotes(notes.map((n) => (n.id === id ? fn(n) : n)));
}

root.addEventListener("change", (ev) => {
  const el = ev.target;
  const { act, unit, title, label } = el.dataset;
  if (act === "done" && el.checked) {
    change(store.upsert(edits, week, unit, title, { done: true, label }));
  } else if (act === "due" && el.value) {
    change(store.upsert(edits, week, unit, title, { due: el.value, label }));
  } else if (act === "import-file" && el.files[0]) {
    el.files[0].text().then((text) => {
      let incoming;
      try {
        incoming = store.parseBackup(text);
      } catch (err) {
        message = err.message;
        draw();
        return;
      }
      const here = edits.length + notes.length;
      const replace = here === 0 || confirm(
        `Replace everything in this browser (${here} changes and notes) with the backup `
        + `(${incoming.edits.length} changes, ${incoming.notes.length} notes)?`);
      if (replace) {
        edits = incoming.edits;
        notes = incoming.notes;
        commit(`Imported ${incoming.edits.length} changes and ${incoming.notes.length} notes.`);
      }
    });
  }
});

root.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const text = new FormData(form).get("text")?.toString().trim();
  if (!text) return;
  if (form.dataset.form === "note") {
    const { unit, title, label, owner } = form.dataset;
    const from = new FormData(form).get("from")?.toString();
    changeNotes([...notes, newNote({ unit, title, label, owner, from, text, week })]);
  } else if (form.dataset.form === "reply") {
    updateNote(form.dataset.id, (n) => ({ ...n, reply: { text, at: new Date().toISOString() } }));
  }
});

root.addEventListener("click", (ev) => {
  const draft = ev.target.closest('a[data-act="email"]');
  if (draft) {
    // Let the link open the reader's email app, then record that a draft was opened.
    const id = draft.dataset.id;
    setTimeout(() => updateNote(id, (n) => ({ ...n, emailed: true })), 0);
    return;
  }
  const el = ev.target.closest("button");
  if (!el) return;
  const { act, unit, title } = el.dataset;
  if (el.dataset.week) {
    week = el.dataset.week;
    history.replaceState(null, "", `#week=${week}`);
    message = "";
    draw();
    window.scrollTo(0, 0);
  } else if (act === "delete-note") {
    if (confirm("Delete this note and its reply?")) changeNotes(notes.filter((n) => n.id !== el.dataset.id));
  } else if (act === "delete-reply") {
    updateNote(el.dataset.id, (n) => ({ ...n, reply: null }));
  } else if (act === "undo") {
    change(store.upsert(edits, week, unit, title, { done: false, due: null }));
  } else if (act === "export") {
    const url = URL.createObjectURL(store.backupBlob(edits, notes));
    const a = Object.assign(document.createElement("a"), {
      href: url, download: `briefing-backup-${new Date().toISOString().slice(0, 10)}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message = "Backup saved to your downloads.";
    draw();
  } else if (act === "import") {
    root.querySelector('[data-act="import-file"]').click();
  } else if (act === "reset") {
    if (confirm("Clear all your changes and notes in this browser? This can't be undone unless you exported a backup.")) {
      edits = [];
      notes = [];
      commit("All changes and notes cleared.");
    }
  }
});

window.addEventListener("hashchange", () => {
  const w = weekFromHash();
  if (w && w !== week) { week = w; draw(); }
});

async function start() {
  try {
    sample = await loadDataFolder(read);
  } catch (err) {
    root.innerHTML = `<div class="load-error"><h1>The sample data didn't load</h1>
      <p>This page reads its data files from the website it is served from. Open it from its GitHub Pages
      address, not as a file on your computer.</p><p class="meta">${esc(err.message)}</p></div>`;
    return;
  }
  ({ edits, notes, saved } = store.load());
  week = weekFromHash();
  rescore();
  draw();
}

start();
