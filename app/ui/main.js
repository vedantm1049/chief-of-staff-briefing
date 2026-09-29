/* The page: which screen to show, the reader's two workspaces (the example
and their own company), and every click, change and drop.

Screens, by the address after #:
  #/          the intro, or straight to the reader's own CEO view if they have one
  #/example   the Wasla example                 (?week=YYYY-MM-DD)
  #/briefing  the reader's own CEO view          (?week=YYYY-MM-DD)
  #/setup     company, areas, leaders, metrics
  #/tasks     people and their tasks
  #/week      this week: requests, sheets, uploads
*/
import { loadDataFolder } from "../engine/sample.js";
import { buildHistory } from "../engine/history.js";
import { WASLA_SETUP, WASLA_CHIEF_OF_STAFF_EMAIL, METRIC_SUGGESTIONS } from "../engine/config.js";
import { toIso } from "../engine/dates.js";
import * as store from "./store.js";
import { newNote, isEmail } from "./notes.js";
import { renderPage, esc } from "./render.js";
import { intro, setupScreen, tasksScreen, sameNameQuestion, weekScreen } from "./screens.js";
import { readTables, likelyMatches } from "./intake.js";
import * as weekly from "./weekly.js";

const root = document.getElementById("app");
const saved = store.storageWorks();
const ws = { example: store.loadWorkspace("example"), own: store.loadWorkspace("own") };

let sample = null;          // the Wasla data, loaded the first time the example opens
let route = { screen: "", week: null };
let mode = null;            // "example" or "own" while a CEO view is shown
let briefings = [];
let message = "";
let setupDraft = null;
let matchQuestion = "";
let uploads = [];

const own = () => ws.own;
const hasOwnSetup = () => own().setup.areas.length > 0;
const hasOwnWeek = () => own().weeks.length > 0;

function todayIso() {
  const d = new Date();
  return toIso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function saveOwn(note = message) {
  if (!store.saveWorkspace("own", own())) message = "This browser is blocking storage. Export a backup to keep your work.";
  else message = note;
}

// --- Routing ----------------------------------------------------------------------

function parseRoute() {
  const hash = location.hash;
  const legacy = /^#week=(\d{4}-\d{2}-\d{2})/.exec(hash);   // links from before there were screens
  if (legacy) return { screen: "example", week: legacy[1] };
  const m = /^#\/([a-z]*)(?:\?week=(\d{4}-\d{2}-\d{2}))?/.exec(hash);
  const screen = m ? m[1] : "";
  return { screen: screen === "add" ? "week" : screen, week: m ? m[2] ?? null : null };
}

function go(hash) {
  if (location.hash === hash) show();
  else location.hash = hash;
}

async function show() {
  const previous = route.screen;
  route = parseRoute();
  const s = route.screen;
  if (s !== previous) { message = ""; matchQuestion = ""; window.scrollTo(0, 0); }
  if (s === "example") return showBriefing("example");
  if (s === "briefing") return hasOwnWeek() ? showBriefing("own") : go(hasOwnSetup() ? "#/week" : "#/setup");
  mode = null;
  if (s === "setup") {
    setupDraft = draftFromOwn();
    return drawSetup();
  }
  if (s === "tasks") return hasOwnSetup() ? drawTasks() : go("#/setup");
  if (s === "week") {
    if (s !== previous) uploads = [];
    return hasOwnSetup() ? drawWeek() : go("#/setup");
  }
  if (hasOwnWeek()) return go("#/briefing");
  root.innerHTML = intro({ hasOwn: hasOwnSetup() });
  document.title = "Chief of Staff briefing";
}

// --- The CEO view -----------------------------------------------------------------

async function showBriefing(which) {
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
  mode = which;
  rescore();
  draw();
}

function rescore() {
  briefings = mode === "example"
    ? buildHistory(sample.weeks, { setup: WASLA_SETUP, aliasText: sample.aliasText, edits: store.byWeek(ws.example.edits) })
    : buildHistory(weekly.weeksForEngine(own()), { setup: own().setup, aliases: weekly.peopleRows(own().people) });
}

const currentSetup = () => (mode === "example" ? WASLA_SETUP : own().setup);
const cosEmail = (which = mode) => ws[which].settings.cosEmail ?? (which === "example" ? WASLA_CHIEF_OF_STAFF_EMAIL : "");

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
    weekEdits: mode === "example" ? w.edits.filter((e) => e.week === week) : [],
    weekCount: mode === "own" ? own().weeks.length : 0,
  });
  document.title = `${currentSetup().company || "Your company"} briefing, week ending ${week}`;
}

/** Save the shown workspace and redraw. Rescore only when a change could move an item. */
function commit(note = "", rescoreToo = true) {
  message = note;
  if (!store.saveWorkspace(mode, ws[mode])) message = "This browser is blocking storage. Export a backup to keep your work.";
  if (rescoreToo) rescore();
  draw();
}

function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Setup ------------------------------------------------------------------------

function draftFromOwn() {
  const { setup, settings } = own();
  const blank = (tier) => ({ was: "", name: "", tier, leader: { name: "", email: "" }, metrics: [] });
  return {
    company: setup.company,
    areaKind: hasOwnSetup() ? setup.areaKind : "",
    boss: hasOwnSetup() ? setup.boss : "",
    cosEmail: settings.cosEmail ?? "",
    areas: setup.areas.length
      ? setup.areas.map((a) => ({ ...a, was: a.name, leader: { ...a.leader }, metrics: a.metrics.map((m) => ({ ...m })) }))
      : [blank("Flagship"), blank("Core"), blank("Core")],
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
  if (!areas.length) return drawSetup(`Add at least one ${d.areaKind || "area"}.`);
  if (new Set(names).size !== names.length) return drawSetup("Two have the same name.");
  if (d.cosEmail.trim() && !isEmail(d.cosEmail.trim())) return drawSetup("Your email doesn't look like an email address.");
  for (const a of areas) {
    if (a.leader.email.trim() && !isEmail(a.leader.email.trim())) return drawSetup(`${a.name}'s leader's email doesn't look like an email address.`);
    for (const m of a.metrics.filter((x) => x.name.trim())) {
      if (String(m.target ?? "").trim() && Number.isNaN(Number(m.target))) return drawSetup(`${a.name}: ${m.name}'s target should be a number.`);
      if (Number.isNaN(Number(m.margin))) return drawSetup(`${a.name}: ${m.name}'s margin should be a number.`);
    }
  }
  // A renamed area keeps its tasks, people and numbers.
  const o = own();
  for (const a of areas) {
    const was = a.was, now = a.name.trim();
    if (!was || was === now) continue;
    for (const t of o.tasks) if (t.area === was) t.area = now;
    for (const p of o.people) if (p.area === was) p.area = now;
    for (const w of o.weeks) {
      for (const r of w.metrics) if (r.area === was) r.area = now;
      for (const t of w.tasks ?? []) if (t.area === was) t.area = now;
      w.received.metrics = w.received.metrics.map((x) => (x === was ? now : x));
    }
  }
  const first = !hasOwnSetup();
  o.setup = store.cleanSetup({ company: d.company, areaKind: d.areaKind, boss: d.boss, areas });
  o.settings = store.cleanSettings({ cosEmail: d.cosEmail });
  saveOwn("Setup saved.");
  go(first || !o.people.length ? "#/tasks" : hasOwnWeek() ? "#/briefing" : "#/week");
}

function setupInput(el) {
  const d = setupDraft;
  let m;
  if (["company", "boss", "areaKind", "cosEmail"].includes(el.name)) d[el.name] = el.value;
  else if ((m = /^a-(\d+)-(name|tier|leader|leaderEmail)$/.exec(el.name))) {
    const a = d.areas[Number(m[1])];
    if (m[2] === "leader") a.leader.name = el.value;
    else if (m[2] === "leaderEmail") a.leader.email = el.value;
    else a[m[2]] = el.value;
  } else if ((m = /^m-(\d+)-(\d+)-(\w+)$/.exec(el.name))) {
    d.areas[Number(m[1])].metrics[Number(m[2])][m[3]] = el.value;
  }
}

function setupClick(el) {
  const d = setupDraft;
  const a = d.areas[Number(el.dataset.a)];
  switch (el.dataset.act) {
    case "add-area": d.areas.push({ was: "", name: "", tier: "Core", leader: { name: "", email: "" }, metrics: [] }); break;
    case "remove-area":
      if (a.was && !confirm(`Remove ${a.was}? Its tasks and numbers stay on record but it will no longer be tracked.`)) return;
      d.areas.splice(Number(el.dataset.a), 1); break;
    case "suggest-metric": a.metrics.push({ ...METRIC_SUGGESTIONS.find((m) => m.name === el.dataset.name), target: "" }); break;
    case "add-metric": a.metrics.push({ name: "", unit: "", target: "", better: "higher", margin: 5, marginKind: "percent" }); break;
    case "remove-metric": a.metrics.splice(Number(el.dataset.m), 1); break;
    default: return;
  }
  drawSetup();
}

// --- Tasks ------------------------------------------------------------------------

function drawTasks() {
  root.innerHTML = tasksScreen(own(), { message, matchQuestion });
  document.title = "Tasks, Chief of Staff briefing";
}

function taskChange(el) {
  const o = own();
  let m;
  if (el.dataset.id && ["task", "due_date", "status", "area", "owner", "waiting_on", "decision_type", "blocked_by"].includes(el.name)) {
    const t = o.tasks.find((x) => x.id === el.dataset.id);
    if (!t) return;
    t[el.name] = el.value;
    t.last_updated = todayIso();
  } else if ((m = /^p-(\d+)-(name|email|area)$/.exec(el.name))) {
    const p = o.people[Number(m[1])];
    const value = el.value.trim();
    if (m[2] === "name") {
      if (!value || o.people.some((x) => x !== p && x.name === value)) { message = "Each person needs a different name."; return drawTasks(); }
      for (const t of o.tasks) if (t.owner === p.name) t.owner = value;
      p.name = value;
    } else if (m[2] === "email") {
      if (value && !isEmail(value)) { message = "That doesn't look like an email address."; return drawTasks(); }
      p.email = value;
    } else {
      p.area = value;
    }
  } else {
    return;
  }
  saveOwn("");
  drawTasks();
}

function addPerson(name, email, area) {
  own().people.push({ name, email: isEmail(email) ? email : "", area, spellings: [] });
  matchQuestion = "";
  saveOwn(`${name} added.`);
  drawTasks();
}

function tasksClick(el) {
  const o = own();
  const p = o.people[Number(el.dataset.p)];
  switch (el.dataset.act) {
    case "add-task": {
      const t = { id: store.newId(), area: p.area || o.setup.areas[0]?.name || "", task: "", owner: p.name, due_date: "",
        status: "Open", waiting_on: "", blocked_by: "", decision_type: "", last_updated: todayIso() };
      o.tasks.push(t);
      saveOwn("");
      drawTasks();
      root.querySelector(`input[name="task"][data-id="${t.id}"]`)?.focus();
      return;
    }
    case "delete-task":
      if (!confirm("Delete this task? If it was flagged last week it will show as removed, not done.")) return;
      o.tasks = o.tasks.filter((t) => t.id !== el.dataset.id);
      break;
    case "remove-person": {
      const n = o.tasks.filter((t) => t.owner === p.name).length;
      if (!confirm(n ? `Remove ${p.name} and delete their ${n} tasks?` : `Remove ${p.name}?`)) return;
      o.tasks = o.tasks.filter((t) => t.owner !== p.name);
      o.people.splice(Number(el.dataset.p), 1);
      break;
    }
    case "same-person": {
      const existing = o.people.find((x) => x.name === el.dataset.as);
      existing.spellings.push(el.dataset.name);
      matchQuestion = "";
      saveOwn(`Noted: ${el.dataset.name} is ${existing.name}.`);
      return drawTasks();
    }
    case "new-person": {
      const form = root.querySelector('form[data-form="add-person"]');
      const f = new FormData(form);
      return addPerson(el.dataset.name, String(f.get("email") ?? "").trim(), String(f.get("area") ?? ""));
    }
    default: return;
  }
  saveOwn("");
  drawTasks();
}

// --- This week --------------------------------------------------------------------

function drawWeek() {
  root.innerHTML = weekScreen(own(), {
    suggestedWeek: weekly.lastSunday(), message, uploads, cosEmail: cosEmail("own"),
    googleLink: weekly.reminderGoogleLink(own(), cosEmail("own")),
  });
  document.title = "This week, Chief of Staff briefing";
}

async function readUploads(files) {
  const o = own();
  for (const f of files) {
    let tables;
    try {
      tables = readTables(f.name, /\.(xlsx|xls)$/i.test(f.name) ? new Uint8Array(await f.arrayBuffer()) : await f.text());
    } catch {
      uploads.push({ name: f.name, error: true, summary: "couldn't be read. Upload the .xlsx sheets this page made." });
      continue;
    }
    const table = tables.find((t) => weekly.sheetKind(t.headers));
    if (!table) {
      uploads.push({ name: f.name, error: true, summary: "isn't one of the sheets this page made, so nothing was read from it." });
      continue;
    }
    if (weekly.sheetKind(table.headers) === "metrics") {
      const read = weekly.readMetricSheet(table, o.setup);
      if (read.unknown.length) {
        uploads.push({ name: f.name, error: true, summary: `names ${read.unknown.join(", ")}, which isn't in your setup.` });
        continue;
      }
      const filled = read.rows.filter((r) => r.value !== "").length;
      uploads.push({ name: f.name, kind: "metrics", read,
        summary: `numbers for ${read.areas.join(", ")}: ${filled} of ${read.rows.length} filled in.`,
        detail: read.rows.map((r) => `${r.metric}: ${r.value || "blank"}${r.count ? ` (from ${r.count})` : ""}`) });
    } else {
      const diff = weekly.diffTaskSheet(o, table, todayIso());
      if (!diff.person) {
        uploads.push({ name: f.name, error: true,
          summary: diff.owners.length ? `is for ${diff.owners.join(", ")}, who isn't in your people list.` : "has no rows left, so it can't say whose it is." });
        continue;
      }
      const parts = [`${diff.updated.length} updated`, `${diff.added.length} new`, `${diff.removed.length} no longer in their sheet`, `${diff.unchanged} unchanged`];
      uploads.push({ name: f.name, kind: "tasks", diff, summary: `${diff.person.name}'s tasks: ${parts.join(", ")}.`,
        detail: [
          ...diff.updated.map((u) => `Updated: ${u.after.task} (${u.changed.join(", ") || "last touched"})`),
          ...diff.added.map((t) => `New: ${t.task}`),
          ...diff.removed.map((t) => `Will be removed (it will show as removed, not done if it was flagged): ${t.task}`),
        ] });
    }
  }
  drawWeek();
}

function applyUpload(u) {
  const o = own();
  const week = o.weeks.at(-1);
  if (u.kind === "metrics") {
    const areas = new Set(u.read.areas);
    week.metrics = [...week.metrics.filter((r) => !areas.has(r.area)), ...u.read.rows.filter((r) => r.value !== "")];
    week.received.metrics = [...new Set([...week.received.metrics, ...u.read.areas])];
  } else {
    weekly.applyTaskDiff(o, u.diff);
    week.received.tasks = [...new Set([...week.received.tasks, u.diff.person.name])];
  }
  u.applied = true;
  saveOwn("");
  drawWeek();
}

function weekClick(el, ev) {
  const o = own();
  const week = o.weeks.at(-1);
  const safe = (s) => s.replace(/[\\/:*?"<>|]/g, " ");
  switch (el.dataset.act) {
    case "metric-request":
      ev.preventDefault();
      location.href = weekly.metricRequest(o.setup.areas[Number(el.dataset.a)], week.weekEnding);
      return;
    case "task-request":
      ev.preventDefault();
      location.href = weekly.taskRequest(o, o.people[Number(el.dataset.p)], week.weekEnding);
      return;
    case "metric-sheet": {
      const a = o.setup.areas[Number(el.dataset.a)];
      return download(`${safe(a.name)} metrics.xlsx`, weekly.metricSheet(a), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    case "task-sheet": {
      const p = o.people[Number(el.dataset.p)];
      return download(`${safe(p.name)} tasks ${week.weekEnding}.xlsx`, weekly.taskSheet(o, p), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    case "reminder-ics":
      return download("weekly-reminder.ics", weekly.reminderIcs(o, cosEmail("own")), "text/calendar");
    case "apply-upload":
      return applyUpload(uploads[Number(el.dataset.i)]);
    default:
  }
}

// --- Events -----------------------------------------------------------------------

root.addEventListener("input", (ev) => {
  if (route.screen === "setup") setupInput(ev.target);
});

root.addEventListener("change", (ev) => {
  const el = ev.target;
  if (route.screen === "setup") return setupInput(el);
  if (route.screen === "tasks") return taskChange(el);
  if (route.screen === "week") {
    if (el.name === "files") readUploads([...el.files]);
    return;
  }
  if (!mode) return;
  const { act, id, area, title, label } = el.dataset;
  const w = ws[mode];
  if (act === "import-file" && el.files[0]) return importBackup(el.files[0]);
  if (act !== "done" && act !== "due") return;
  if (!(act === "done" ? el.checked : el.value)) return;
  if (mode === "own") {
    // The reader's own tasks are changed where they live.
    const t = own().tasks.find((x) => x.id === id);
    if (!t) return;
    if (act === "done") t.status = "Done";
    else t.due_date = el.value;
    t.last_updated = todayIso();
  } else {
    w.edits = store.upsert(w.edits, shownWeek(), area, title, act === "done" ? { done: true, label } : { due: el.value, label });
  }
  commit();
});

root.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const f = new FormData(form);
  const kind = form.dataset.form;
  if (kind === "setup") return saveSetup();
  if (kind === "add-person") {
    const name = String(f.get("name") ?? "").trim();
    const email = String(f.get("email") ?? "").trim();
    if (!name) return;
    if (own().people.some((p) => p.name === name)) { message = `${name} is already on the list.`; return drawTasks(); }
    if (email && !isEmail(email)) { message = "That doesn't look like an email address."; return drawTasks(); }
    const matches = likelyMatches(name, own().people);
    if (matches.length) {
      matchQuestion = sameNameQuestion(name, matches);
      drawTasks();
      const again = root.querySelector('form[data-form="add-person"]');
      again.name.value = name; again.email.value = email; again.area.value = String(f.get("area") ?? "");
      return;
    }
    return addPerson(name, email, String(f.get("area") ?? ""));
  }
  if (kind === "start-week") {
    try {
      weekly.startWeek(own(), String(f.get("week")));
    } catch (err) {
      message = err.message;
      return drawWeek();
    }
    uploads = [];
    saveOwn("Week started. Send the requests below.");
    return drawWeek();
  }
  if (!mode) return;
  const w = ws[mode];
  if (kind === "cos-email") {
    w.settings = store.cleanSettings({ cosEmail: String(f.get("email") ?? "") });
    return commit(w.settings.cosEmail ? `Drafts will copy ${w.settings.cosEmail}.` : "That doesn't look like an email address.", false);
  }
  const text = String(f.get("text") ?? "").trim();
  if (!text) return;
  if (kind === "note") {
    const { taskId, area, title, label, owner } = form.dataset;
    w.notes = [...w.notes, newNote({ taskId, area, title, label, owner, from: String(f.get("from")), text, week: shownWeek() })];
    commit("", false);
  } else if (kind === "reply") {
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
  const el = ev.target.closest("button, a[data-act]");
  if (!el) return;
  if (route.screen === "setup") return setupClick(el);
  if (route.screen === "tasks") return tasksClick(el);
  if (route.screen === "week") return weekClick(el, ev);
  if (!mode) return;

  const w = ws[mode];
  const { act, area, title } = el.dataset;
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
    if (!confirm(`Undo starting the week ending ${el.dataset.target}? Its numbers are dropped; tasks stay as they are now.`)) return;
    const o = own();
    o.weeks.pop();
    if (o.weeks.length) o.weeks.at(-1).tasks = null;
    saveOwn("");
    go(hasOwnWeek() ? "#/briefing" : "#/week");
  } else if (act === "export") {
    const name = mode === "own" ? "briefing-backup" : "briefing-example-backup";
    download(`${name}-${todayIso()}.json`, store.backupBlob(mode, ws[mode]));
    message = "Backup saved to your downloads.";
    draw();
  } else if (act === "import") {
    root.querySelector('[data-act="import-file"]').click();
  } else if (act === "reset") {
    const ask = mode === "own"
      ? "Delete your setup, people, tasks, weeks and notes from this browser? This can't be undone unless you exported a backup."
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

// Returned sheets dropped on This week.
root.addEventListener("dragover", (ev) => {
  if (route.screen === "week" && ev.target.closest("[data-drop]")) ev.preventDefault();
});
root.addEventListener("drop", (ev) => {
  if (route.screen !== "week" || !ev.target.closest("[data-drop]")) return;
  ev.preventDefault();
  readUploads([...ev.dataTransfer.files]);
});

window.addEventListener("hashchange", show);
show();
