/* The page: which screen to show, the reader's two workspaces (the example
and their own company), and every click, change and drop.

Screens, by the address after #:
  #/          the intro, or straight to the reader's own briefing if they have one
  #/example   the Wasla example            (?week=YYYY-MM-DD)
  #/briefing  the reader's own briefing     (?week=YYYY-MM-DD)
  #/setup     setup for their company
  #/add       add a week's files
*/
import { loadDataFolder } from "../engine/sample.js";
import { buildHistory } from "../engine/history.js";
import { WASLA_SETUP, WASLA_CHIEF_OF_STAFF_EMAIL } from "../engine/config.js";
import { toIso } from "../engine/dates.js";
import * as store from "./store.js";
import { newNote, isEmail } from "./notes.js";
import { renderPage, esc } from "./render.js";
import { intro, setupScreen, addWeekScreen, NEW } from "./screens.js";
import * as intake from "./intake.js";

const root = document.getElementById("app");
const saved = store.storageWorks();
const ws = { example: store.loadWorkspace("example"), own: store.loadWorkspace("own") };

let sample = null;          // the Wasla data, loaded the first time the example opens
let route = { screen: "", week: null };
let mode = null;            // "example" or "own" while a briefing is shown
let briefings = [];
let message = "";
let setupDraft = null;
let intakeState = null;

// --- Routing ----------------------------------------------------------------------

function parseRoute() {
  const hash = location.hash;
  const legacy = /^#week=(\d{4}-\d{2}-\d{2})/.exec(hash);   // links from before there were screens
  if (legacy) return { screen: "example", week: legacy[1] };
  const m = /^#\/([a-z]*)(?:\?week=(\d{4}-\d{2}-\d{2}))?/.exec(hash);
  return { screen: m ? m[1] : "", week: m ? m[2] ?? null : null };
}

function go(hash) {
  if (location.hash === hash) show();
  else location.hash = hash;
}

const hasOwnData = () => ws.own.weeks.length > 0;
const hasOwnSetup = () => ws.own.setup.areas.length > 0;

async function show() {
  const previous = mode;
  route = parseRoute();
  const s = route.screen;
  if (s === "example") return showBriefing("example", previous);
  if (s === "briefing") return hasOwnData() ? showBriefing("own", previous) : go(hasOwnSetup() ? "#/add" : "#/setup");
  mode = null;
  message = "";
  window.scrollTo(0, 0);
  if (s === "setup") {
    setupDraft = draftFromOwn();
    return drawSetup();
  }
  if (s === "add") {
    if (!hasOwnSetup()) return go("#/setup");
    intakeState = freshIntake();
    return drawAdd();
  }
  if (hasOwnData()) return go("#/briefing");
  root.innerHTML = intro({ hasOwn: hasOwnSetup() });
  document.title = "Chief of Staff briefing";
}

// --- Briefings --------------------------------------------------------------------

async function showBriefing(which, previous) {
  if (which === "example" && !sample) {
    root.innerHTML = '<p class="loading">Loading the example…</p>';
    try {
      sample = await loadDataFolder(async (rel) => {
        const res = await fetch(`data/${rel}`);
        if (!res.ok) throw new Error(`${rel} returned ${res.status}`);
        return res.text();
      });
    } catch (err) {
      root.innerHTML = `<div class="load-error"><h1>The example didn't load</h1>
        <p>This page reads the example's files from the website it is served from. Open it from its GitHub
        Pages address, not as a file on your computer.</p><p class="meta">${esc(err.message)}</p></div>`;
      return;
    }
  }
  if (previous !== which) message = "";
  mode = which;
  rescore();
  draw();
  if (previous !== which) window.scrollTo(0, 0);
}

function rescore() {
  const edits = store.byWeek(ws[mode].edits);
  briefings = mode === "example"
    ? buildHistory(sample.weeks, { setup: WASLA_SETUP, aliasText: sample.aliasText, edits })
    : buildHistory(ws.own.weeks, { setup: ws.own.setup, aliases: intake.ownerRows(ws.own.owners), edits });
}

function currentSetup() {
  return mode === "example" ? WASLA_SETUP : ws.own.setup;
}

function cosEmail() {
  return ws[mode].settings.cosEmail ?? (mode === "example" ? WASLA_CHIEF_OF_STAFF_EMAIL : "");
}

function shownWeek() {
  const isos = briefings.map((b) => toIso(b.weekEnding));
  return isos.includes(route.week) ? route.week : isos.at(-1);
}

function draw() {
  const week = shownWeek();
  const current = briefings.find((b) => toIso(b.weekEnding) === week);
  const w = ws[mode];
  root.innerHTML = renderPage({
    mode, setup: currentSetup(), briefings, current,
    edits: w.edits, notes: w.notes, cosEmail: cosEmail(), saved, message,
    weekEdits: w.edits.filter((e) => e.week === week),
    weekCount: mode === "own" ? ws.own.weeks.length : 0,
  });
  document.title = `${currentSetup().company || "Your company"} briefing, week ending ${week}`;
}

/** Save the current workspace. Rescore only when a change could move an item. */
function commit(note = "", rescoreToo = true) {
  store.saveWorkspace(mode, ws[mode]);
  message = note;
  if (rescoreToo) rescore();
  draw();
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Setup ------------------------------------------------------------------------

function draftFromOwn() {
  const { setup, owners, settings } = ws.own;
  return {
    company: setup.company,
    areaKind: hasOwnSetup() ? setup.areaKind : "",
    boss: hasOwnSetup() ? setup.boss : "",
    cosEmail: settings.cosEmail ?? "",
    areas: setup.areas.length ? setup.areas.map((a) => ({ ...a }))
      : [{ name: "", tier: "Flagship" }, { name: "", tier: "Core" }, { name: "", tier: "Core" }],
    owners: owners.map((o) => ({ name: o.name, email: o.email, spellings: o.spellings.join(", ") })),
  };
}

function drawSetup(note = "") {
  root.innerHTML = setupScreen(setupDraft, { firstTime: !hasOwnSetup(), message: note });
  document.title = "Setup, Chief of Staff briefing";
}

function saveSetup() {
  const d = setupDraft;
  const areas = d.areas.filter((a) => a.name.trim());
  const names = areas.map((a) => a.name.trim().toLowerCase());
  if (!areas.length) return drawSetup("Add at least one area.");
  if (new Set(names).size !== names.length) return drawSetup("Two areas have the same name.");
  if (d.cosEmail.trim() && !isEmail(d.cosEmail.trim())) return drawSetup("Your email doesn't look like an email address.");
  const badOwner = d.owners.find((o) => o.email.trim() && !isEmail(o.email.trim()));
  if (badOwner) return drawSetup(`${badOwner.name || "One person"}'s email doesn't look like an email address.`);

  ws.own.setup = store.cleanSetup({ company: d.company, areaKind: d.areaKind, boss: d.boss, areas });
  ws.own.owners = store.cleanOwners(d.owners.map((o) => ({
    name: o.name, email: o.email, spellings: o.spellings.split(",").map((s) => s.trim()).filter(Boolean),
  })));
  ws.own.settings = store.cleanSettings({ cosEmail: d.cosEmail });
  store.saveWorkspace("own", ws.own);
  go(hasOwnData() ? "#/briefing" : "#/add");
}

// --- Adding a week ----------------------------------------------------------------

function lastSunday() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function freshIntake() {
  return { week: lastSunday(), tables: [], ownerAnswers: {}, areaAnswers: {}, message: "" };
}

function addTables(tables) {
  for (const t of tables) {
    const sig = intake.signature(t.headers);
    const remembered = ws.own.mappings[sig];
    const kind = remembered?.kind ?? intake.guessKind(t.headers);
    const template = !remembered && intake.isTemplate(t.headers, kind);
    const mapping = remembered
      ? { kind, columns: { ...remembered.columns }, area: remembered.area }
      : { kind, columns: intake.autoMatch(t.headers, kind), area: "" };
    intakeState.tables.push({ ...t, mapping, template, remembered: Boolean(remembered) });
  }
  if (!tables.length) intakeState.message = "Nothing readable in that. Include the header row.";
}

async function readFiles(files) {
  intakeState.message = "";
  for (const f of files) {
    try {
      const content = /\.(xlsx|xls)$/i.test(f.name) ? new Uint8Array(await f.arrayBuffer()) : await f.text();
      addTables(intake.readTables(f.name, content));
    } catch {
      intakeState.message = `${f.name} couldn't be read. CSV, Excel or a pasted table work.`;
    }
  }
  drawAdd();
}

/** Mapped rows, the questions still open, and what blocks saving. */
function intakeStatus() {
  const s = intakeState;
  const problems = [];
  const ready = [];
  s.tables.forEach((t) => {
    const p = intake.mappingProblems(t.mapping, t.mapping.kind);
    if (p.length) problems.push(`${t.name}: ${p[0]}`);
    else ready.push(t);
  });
  const tasks = ready.filter((t) => t.mapping.kind === "tasks").flatMap((t) => intake.applyMapping(t, t.mapping));
  const metrics = ready.filter((t) => t.mapping.kind === "metrics").flatMap((t) => intake.applyMapping(t, t.mapping));
  const questions = {
    owners: intake.newOwnerNames(tasks, ws.own.owners),
    areas: intake.unknownAreaNames([...tasks, ...metrics], ws.own.setup.areas),
  };
  for (const n of questions.owners) if (!s.ownerAnswers[n]?.as) problems.push(`Say who ${n} is.`);
  for (const n of questions.areas) if (!s.areaAnswers[n]?.as) problems.push(`Say what ${n} is.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.week)) problems.push("Pick the week-ending date.");
  if (!s.tables.length) problems.push("Add at least one file.");
  else if (!tasks.length && !metrics.length) problems.push("No rows to save yet.");
  return { tasks, metrics, questions, problems };
}

function drawAdd() {
  const { questions, problems } = intakeStatus();
  root.innerHTML = addWeekScreen(intakeState, {
    setup: ws.own.setup, owners: ws.own.owners, questions, problems,
    existingWeek: ws.own.weeks.some((w) => w.weekEnding === intakeState.week),
  });
  document.title = "Add a week, Chief of Staff briefing";
}

function saveWeek() {
  const s = intakeState;
  const { tasks, metrics, questions, problems } = intakeStatus();
  if (problems.length) return drawAdd();

  // Areas: the reader said which setup area each unknown name is, or added it.
  const areaName = {};
  for (const n of questions.areas) {
    const ans = s.areaAnswers[n];
    if (ans.as === NEW) {
      ws.own.setup.areas.push({ name: n, tier: ans.tier ?? "Core" });
      areaName[n] = n;
    } else {
      areaName[n] = ans.as;
    }
  }
  const fixArea = (r) => ({ ...r, area: areaName[r.area] ?? r.area });

  // Owners: a new person, or another spelling of someone already known.
  for (const n of questions.owners) {
    const ans = s.ownerAnswers[n];
    if (ans.as === NEW) ws.own.owners.push({ name: n, email: isEmail(ans.email) ? ans.email.trim() : "", spellings: [] });
    else ws.own.owners.find((o) => o.name === ans.as)?.spellings.push(n);
  }

  // Remember how each file's columns were matched.
  for (const t of s.tables) {
    if (!t.template) ws.own.mappings[intake.signature(t.headers)] = t.mapping;
  }

  // New data wins: an area's rows in these files replace that area's rows for this week.
  const newTasks = tasks.map(fixArea), newMetrics = metrics.map(fixArea);
  const key = (r) => String(r.area).trim().toLowerCase();
  const taskAreas = new Set(newTasks.map(key)), metricAreas = new Set(newMetrics.map(key));
  const existing = ws.own.weeks.find((w) => w.weekEnding === s.week);
  if (existing) {
    existing.tasks = [...existing.tasks.filter((r) => !taskAreas.has(key(r))), ...newTasks];
    existing.metrics = [...existing.metrics.filter((r) => !metricAreas.has(key(r))), ...newMetrics];
    existing.files = [...existing.files, ...s.tables.map((t) => t.name)];
  } else {
    ws.own.weeks.push({ weekEnding: s.week, tasks: newTasks, metrics: newMetrics, files: s.tables.map((t) => t.name) });
  }
  ws.own = store.cleanWorkspace("own", ws.own);
  store.saveWorkspace("own", ws.own);
  go(`#/briefing?week=${s.week}`);
}

// --- Events -----------------------------------------------------------------------

root.addEventListener("input", (ev) => {
  const el = ev.target;
  if (route.screen === "setup" && el.name) {
    const m = /^(area|owner)-(name|tier|email|spellings)-(\d+)$/.exec(el.name);
    if (m) (m[1] === "area" ? setupDraft.areas : setupDraft.owners)[Number(m[3])][m[2]] = el.value;
    else if (["company", "boss", "areaKind", "cosEmail"].includes(el.name)) setupDraft[el.name] = el.value;
  }
  if (route.screen === "add" && el.name === "owner-email") {
    intakeState.ownerAnswers[el.dataset.name] = { ...intakeState.ownerAnswers[el.dataset.name], email: el.value };
  }
});

root.addEventListener("change", (ev) => {
  const el = ev.target;
  if (route.screen === "setup") {
    if (/^area-tier-\d+$/.test(el.name)) setupDraft.areas[Number(el.name.split("-")[2])].tier = el.value;
    return;
  }
  if (route.screen === "add") return onAddChange(el);
  if (!mode) return;
  const { act, area, title, label } = el.dataset;
  const w = ws[mode];
  if (act === "done" && el.checked) {
    w.edits = store.upsert(w.edits, shownWeek(), area, title, { done: true, label });
    commit();
  } else if (act === "due" && el.value) {
    w.edits = store.upsert(w.edits, shownWeek(), area, title, { due: el.value, label });
    commit();
  } else if (act === "import-file" && el.files[0]) {
    importBackup(el.files[0]);
  }
});

function onAddChange(el) {
  const s = intakeState;
  let m;
  if (el.name === "week") s.week = el.value;
  else if (el.name === "files") return readFiles([...el.files]);
  else if ((m = /^map-(\d+)-(\w+)$/.exec(el.name))) {
    const t = s.tables[Number(m[1])];
    if (el.value) t.mapping.columns[m[2]] = el.value;
    else delete t.mapping.columns[m[2]];
    t.template = false;   // matched by hand, so remember it
  } else if ((m = /^area-(\d+)$/.exec(el.name))) {
    s.tables[Number(m[1])].mapping.area = el.value;
  } else if ((m = /^kind-(\d+)$/.exec(el.name))) {
    const t = s.tables[Number(m[1])];
    t.mapping = { kind: el.value, columns: intake.autoMatch(t.headers, el.value), area: t.mapping.area };
    t.template = intake.isTemplate(t.headers, el.value);
  } else if (el.name === "owner-as") {
    s.ownerAnswers[el.dataset.name] = { ...s.ownerAnswers[el.dataset.name], as: el.value };
  } else if (el.name === "area-as") {
    s.areaAnswers[el.dataset.name] = { ...s.areaAnswers[el.dataset.name], as: el.value };
  } else if (el.name === "area-tier") {
    s.areaAnswers[el.dataset.name] = { ...s.areaAnswers[el.dataset.name], tier: el.value };
  } else {
    return;
  }
  drawAdd();
}

root.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const form = ev.target;
  if (form.dataset.form === "setup") return saveSetup();
  if (!mode) return;
  const w = ws[mode];
  if (form.dataset.form === "cos-email") {
    w.settings = store.cleanSettings({ cosEmail: new FormData(form).get("email")?.toString() });
    return commit(w.settings.cosEmail ? `Drafts will copy ${w.settings.cosEmail}.` : "That doesn't look like an email address.", false);
  }
  const text = new FormData(form).get("text")?.toString().trim();
  if (!text) return;
  if (form.dataset.form === "note") {
    const { area, title, label, owner } = form.dataset;
    const from = new FormData(form).get("from")?.toString();
    w.notes = [...w.notes, newNote({ area, title, label, owner, from, text, week: shownWeek() })];
    commit("", false);
  } else if (form.dataset.form === "reply") {
    w.notes = w.notes.map((n) => (n.id === form.dataset.id ? { ...n, reply: { text, at: new Date().toISOString() } } : n));
    commit("", false);
  }
});

root.addEventListener("click", (ev) => {
  const draft = ev.target.closest('a[data-act="email"]');
  if (draft && mode) {
    // Let the link open the reader's email app, then record that a draft was opened.
    const id = draft.dataset.id;
    setTimeout(() => {
      ws[mode].notes = ws[mode].notes.map((n) => (n.id === id ? { ...n, emailed: true } : n));
      commit("", false);
    }, 0);
    return;
  }
  const el = ev.target.closest("button");
  if (!el) return;
  const { act } = el.dataset;

  if (route.screen === "setup") {
    const i = Number(el.dataset.i);
    if (act === "add-area") setupDraft.areas.push({ name: "", tier: "Core" });
    else if (act === "remove-area") setupDraft.areas.splice(i, 1);
    else if (act === "add-owner") setupDraft.owners.push({ name: "", email: "", spellings: "" });
    else if (act === "remove-owner") setupDraft.owners.splice(i, 1);
    else return;
    return drawSetup();
  }

  if (route.screen === "add") {
    if (act === "download-template") {
      const files = intake.templateFiles(ws.own.setup);
      return download(el.dataset.file, new Blob([files[el.dataset.file]], { type: "text/csv" }));
    }
    if (act === "use-paste") {
      intakeState.message = "";
      addTables(intake.readTables("Pasted table", root.querySelector('textarea[name="paste"]').value));
      return drawAdd();
    }
    if (act === "remove-table") {
      intakeState.tables.splice(Number(el.dataset.i), 1);
      return drawAdd();
    }
    if (act === "save-week") return saveWeek();
    return;
  }

  if (!mode) return;
  const w = ws[mode];
  const { area, title } = el.dataset;
  if (el.dataset.week) {
    go(`#/${mode === "example" ? "example" : "briefing"}?week=${el.dataset.week}`);
    window.scrollTo(0, 0);
  } else if (act === "delete-note") {
    if (confirm("Delete this note and its reply?")) {
      w.notes = w.notes.filter((n) => n.id !== el.dataset.id);
      commit("", false);
    }
  } else if (act === "delete-reply") {
    w.notes = w.notes.map((n) => (n.id === el.dataset.id ? { ...n, reply: null } : n));
    commit("", false);
  } else if (act === "undo") {
    w.edits = store.upsert(w.edits, shownWeek(), area, title, { done: false, due: null });
    commit();
  } else if (act === "remove-week") {
    if (confirm(`Remove the week ending ${el.dataset.target}, with its files and your changes to it? Notes stay.`)) {
      ws.own.weeks = ws.own.weeks.filter((x) => x.weekEnding !== el.dataset.target);
      ws.own.edits = ws.own.edits.filter((e) => e.week !== el.dataset.target);
      store.saveWorkspace("own", ws.own);
      go(hasOwnData() ? "#/briefing" : "#/add");
    }
  } else if (act === "export") {
    const name = mode === "own" ? "briefing-backup" : "briefing-example-backup";
    download(`${name}-${new Date().toISOString().slice(0, 10)}.json`, store.backupBlob(mode, ws[mode]));
    message = "Backup saved to your downloads.";
    draw();
  } else if (act === "import") {
    root.querySelector('[data-act="import-file"]').click();
  } else if (act === "reset") {
    const ask = mode === "own"
      ? "Delete your setup, every week's files, changes and notes from this browser? This can't be undone unless you exported a backup."
      : "Clear all your changes and notes on the example? This can't be undone unless you exported a backup.";
    if (!confirm(ask)) return;
    if (mode === "own") {
      store.deleteWorkspace("own");
      ws.own = store.loadWorkspace("own");
      go("#/");
    } else {
      ws.example = store.cleanWorkspace("example", {});
      commit("All changes and notes cleared.");
    }
  }
});

async function importBackup(file) {
  let incoming;
  try {
    incoming = store.parseBackup(await file.text());
  } catch (err) {
    message = err.message;
    return draw();
  }
  const where = incoming.id === "own" ? "your company's data" : "your changes and notes on the example";
  if (!confirm(`Replace ${where} in this browser with the backup?`)) return;
  ws[incoming.id] = incoming.state;
  store.saveWorkspace(incoming.id, incoming.state);
  go(incoming.id === "own" ? "#/briefing" : "#/example");
}

// Files dropped on the add-week screen.
root.addEventListener("dragover", (ev) => {
  if (route.screen === "add" && ev.target.closest("[data-drop]")) ev.preventDefault();
});
root.addEventListener("drop", (ev) => {
  if (route.screen !== "add" || !ev.target.closest("[data-drop]")) return;
  ev.preventDefault();
  readFiles([...ev.dataTransfer.files]);
});

window.addEventListener("hashchange", show);
show();
