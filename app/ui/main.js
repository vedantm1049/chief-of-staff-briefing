/* Loads the Wasla sample, scores all four weeks in the browser, and redraws
the page whenever the reader switches week or changes an item.
*/
import { loadDataFolder } from "../engine/sample.js";
import { buildHistory } from "../engine/history.js";
import { WASLA_UNITS } from "../engine/config.js";
import { toIso } from "../engine/dates.js";
import * as store from "./store.js";
import { renderPage, esc } from "./render.js";

const DATA = "data/";
const root = document.getElementById("app");
const tiers = Object.fromEntries(WASLA_UNITS.map((u) => [u.name, u.tier]));

let sample = null;
let briefings = [];
let week = null;       // the week ending being shown, "YYYY-MM-DD"
let edits = [];
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
    briefings, current, tiers, edits, saved, message,
    weekEdits: edits.filter((e) => e.week === week),
  });
  document.title = `Wasla Group briefing, week ending ${week}`;
}

function change(next, note = "") {
  edits = next;
  const ok = store.save(edits);
  if (saved && !ok) saved = false;
  message = note;
  rescore();
  draw();
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
      const replace = edits.length === 0 || confirm(
        `Replace the ${edits.length} change(s) in this browser with the ${incoming.length} in the backup?`);
      if (replace) change(incoming, `Imported ${incoming.length} change(s).`);
    });
  }
});

root.addEventListener("click", (ev) => {
  const el = ev.target.closest("button");
  if (!el) return;
  const { act, unit, title } = el.dataset;
  if (el.dataset.week) {
    week = el.dataset.week;
    history.replaceState(null, "", `#week=${week}`);
    message = "";
    draw();
    window.scrollTo(0, 0);
  } else if (act === "undo") {
    change(store.upsert(edits, week, unit, title, { done: false, due: null }));
  } else if (act === "export") {
    const url = URL.createObjectURL(store.backupBlob(edits));
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
    if (confirm("Clear all your changes in this browser? This can't be undone unless you exported a backup.")) {
      change([], "All changes cleared.");
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
  ({ edits, saved } = store.load());
  week = weekFromHash();
  rescore();
  draw();
}

start();
