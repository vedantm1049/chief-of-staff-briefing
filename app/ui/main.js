/* The page: which screen to show, the two companies (the Wasla example and
the reader's own), and every click, change and drop. Both companies have the
same screens and the same shape; the example starts from data/example.json.

Screens, by the address after #:
  #/          the intro, or straight to the reader's own CEO view if they have one
  #/briefing  the reader's own CEO view          (?week=YYYY-MM-DD)
  #/setup     company, areas, leaders, metrics
  #/tasks     people and their tasks
  #/week      this week: requests, sheets, uploads
  #/example, #/example/setup, #/example/tasks, #/example/week: the same, for the example
*/
import { buildHistory } from "../engine/history.js";
import { METRIC_SUGGESTIONS } from "../engine/config.js";
import { toIso, parseIsoDate } from "../engine/dates.js";
import * as store from "./store.js";
import { newNote, isEmail, emailDraft } from "./notes.js";
import { renderPage, esc, link } from "./render.js";
import { intro, setupScreen, tasksScreen, sameNameQuestion, weekScreen } from "./screens.js";
import { readTables, likelyMatches } from "./intake.js";
import * as weekly from "./weekly.js";

const root = document.getElementById("app");
const saved = store.storageWorks();
const ws = { example: null, own: store.loadWorkspace("own") ?? store.cleanWorkspace("own", {}) };

let route = { scope: "own", screen: "", week: null };
let briefings = [];
let notice = null;           // after the boss answers: what was recorded, and a draft to the owner
let message = "";
let setupDraft = null;
let matchQuestion = "";
let uploads = [];

/** The company on screen: the example or the reader's own. */
const cur = () => ws[route.scope];
const hasSetup = () => cur().setup.areas.length > 0;
const hasWeek = () => cur().weeks.length > 0;
const to = (screen, week) => link(route.scope, screen, week);

/** Today, for stamping a change. The example lives in its own weeks, so there
it is the Monday its current week is read; for a real company, today. */
function todayIso() {
  const current = route.scope === "example" ? ws.example?.weeks.at(-1) : null;
  if (current) return toIso(parseIsoDate(current.weekEnding) + 1);
  const d = new Date();
  return toIso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function save(note = message) {
  if (!store.saveWorkspace(route.scope, cur())) message = "This browser is blocking storage. Export a backup to keep your work.";
  else message = note;
}

/** The example: the reader's changed copy if they have one, else the original. */
async function ensureExample() {
  if (ws.example) return true;
  ws.example = store.loadWorkspace("example");
  if (ws.example) return true;
  root.innerHTML = '<p class="loading">Loading the example…</p>';
  try {
    const res = await fetch("data/example.json");
    if (!res.ok) throw new Error(`data/example.json returned ${res.status}`);
    ws.example = store.cleanWorkspace("example", await res.json());
    return true;
  } catch (err) {
    root.innerHTML = `<div class="load-error"><h1>The example didn't load</h1>
      <p>This page reads the example from the website it is served from. Open it from its GitHub Pages
      address, not as a file on your computer.</p><p class="meta">${esc(err.message)}</p></div>`;
    return false;
  }
}

// --- Routing ----------------------------------------------------------------------

function parseRoute() {
  const hash = location.hash;
  const legacy = /^#week=(\d{4}-\d{2}-\d{2})/.exec(hash);   // links from before there were screens
  if (legacy) return { scope: "example", screen: "briefing", week: legacy[1] };
  const m = /^#\/(example\/?)?([a-z]*)(?:\?week=(\d{4}-\d{2}-\d{2}))?/.exec(hash);
  const scope = m?.[1] ? "example" : "own";
  let screen = m?.[2] ?? "";
  if (screen === "add") screen = "week";
  if (scope === "example" && !screen) screen = "briefing";
  return { scope, screen, week: m?.[3] ?? null };
}

function go(hash) {
  if (location.hash === hash) show();
  else location.hash = hash;
}

async function show() {
  const previous = route;
  route = parseRoute();
  const s = route.screen;
  if (s !== previous.screen || route.scope !== previous.scope) {
    message = ""; matchQuestion = ""; uploads = []; notice = null;
    window.scrollTo(0, 0);
  }
  if (route.scope === "example" && !(await ensureExample())) return;
  if (s === "briefing") return hasWeek() ? showBriefing() : go(to(hasSetup() ? "week" : "setup"));
  if (s === "setup") {
    setupDraft = draftFrom(cur());
    return drawSetup();
  }
  if (s === "tasks") return hasSetup() ? drawTasks() : go(to("setup"));
  if (s === "week") return hasSetup() ? drawWeek() : go(to("setup"));
  if (hasWeek()) return go("#/briefing");
  root.innerHTML = intro({ hasOwn: hasSetup() });
  document.title = "Chief of Staff briefing";
}

// --- The CEO view -----------------------------------------------------------------

function showBriefing() {
  rescore();
  draw();
}

function rescore() {
  briefings = buildHistory(weekly.weeksForEngine(cur()), { setup: cur().setup, aliases: weekly.peopleRows(cur().people) });
}

const cosEmail = () => cur().settings.cosEmail ?? "";

function shownWeek() {
  const isos = briefings.map((b) => toIso(b.weekEnding));
  return isos.includes(route.week) ? route.week : isos.at(-1);
}

function draw() {
  const week = shownWeek();
  const current = briefings.find((b) => toIso(b.weekEnding) === week);
  root.innerHTML = renderPage({
    scope: route.scope, setup: cur().setup, briefings, current,
    notes: cur().notes, cosEmail: cosEmail(), saved, message, notice,
  });
  document.title = `${cur().setup.company || "Your company"} briefing, week ending ${week}`;
}

/** Save the company on screen and redraw the CEO view. Rescore only when a
change could move an item. */
function commit(note = "", rescoreToo = true) {
  save(note);
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

function draftFrom(company) {
  const { setup, settings } = company;
  const blank = (tier) => ({ was: "", name: "", tier, leader: { name: "", email: "" }, metrics: [] });
  return {
    company: setup.company,
    areaKind: hasSetup() ? setup.areaKind : "",
    boss: hasSetup() ? setup.boss : "",
    cosEmail: settings.cosEmail ?? "",
    areas: setup.areas.length
      ? setup.areas.map((a) => ({ ...a, was: a.name, leader: { ...a.leader }, metrics: a.metrics.map((m) => ({ ...m })) }))
      : [blank("Flagship"), blank("Core"), blank("Core")],
  };
}

function drawSetup(note = "") {
  root.innerHTML = setupScreen(setupDraft, { firstTime: !hasSetup(), message: note, scope: route.scope });
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
    if (a.sheetLink?.trim()) {
      try {
        a.sheetLink = store.sheetCsvLink(a.sheetLink);
      } catch (err) {
        return drawSetup(`${a.name}'s Google Sheet link: ${err.message}`);
      }
    }
    for (const m of a.metrics.filter((x) => x.name.trim())) {
      if (String(m.target ?? "").trim() && store.readNumber(m.target) == null) return drawSetup(`${a.name}: ${m.name}'s target should be a number.`);
      if (String(m.margin ?? "").trim() && store.readNumber(m.margin) == null) return drawSetup(`${a.name}: ${m.name}'s margin should be a number.`);
    }
  }
  // A renamed area keeps its tasks, people and numbers.
  const o = cur();
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
  const first = !hasSetup();
  o.setup = store.cleanSetup({ company: d.company, areaKind: d.areaKind, boss: d.boss, areas });
  o.settings = store.cleanSettings({ cosEmail: d.cosEmail });
  weekly.syncLeaders(o);
  save("Setup saved.");
  go(to(first || !o.people.length ? "tasks" : hasWeek() ? "briefing" : "week"));
}

function setupInput(el) {
  const d = setupDraft;
  let m;
  if (["company", "boss", "areaKind", "cosEmail"].includes(el.name)) d[el.name] = el.value;
  else if ((m = /^a-(\d+)-(name|tier|leader|leaderEmail|sheetLink)$/.exec(el.name))) {
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
  root.innerHTML = tasksScreen(cur(), { message, matchQuestion, scope: route.scope });
  document.title = "Tasks, Chief of Staff briefing";
}

function taskChange(el) {
  const o = cur();
  let m;
  if (el.dataset.id && ["task", "due_date", "status", "area", "owner", "waiting_on", "decision_type", "blocked_by"].includes(el.name)) {
    const t = o.tasks.find((x) => x.id === el.dataset.id);
    if (!t) return;
    t[el.name] = el.value;
    t.last_updated = todayIso();
  } else if ((m = /^p-(\d+)-(name|email|area|sheetLink)$/.exec(el.name))) {
    const p = o.people[Number(m[1])];
    const value = el.value.trim();
    if (m[2] === "name") {
      if (!value || o.people.some((x) => x !== p && x.name === value)) { message = "Each person needs a different name."; return drawTasks(); }
      for (const t of o.tasks) if (t.owner === p.name) t.owner = value;
      p.name = value;
    } else if (m[2] === "email") {
      if (value && !isEmail(value)) { message = "That doesn't look like an email address."; return drawTasks(); }
      p.email = value;
    } else if (m[2] === "sheetLink") {
      try {
        p.sheetLink = value ? store.sheetCsvLink(value) : "";
      } catch (err) {
        message = `${p.name}'s Google Sheet link: ${err.message}`;
        return drawTasks();
      }
    } else {
      p.area = value;
    }
  } else {
    return;
  }
  save("");
  drawTasks();
}

function addPerson(name, email, area) {
  cur().people.push({ name, email: isEmail(email) ? email : "", area, spellings: [] });
  matchQuestion = "";
  save(`${name} added.`);
  drawTasks();
}

function tasksClick(el) {
  const o = cur();
  const p = o.people[Number(el.dataset.p)];
  switch (el.dataset.act) {
    case "add-task": {
      const t = { id: store.newId(), area: p.area || o.setup.areas[0]?.name || "", task: "", owner: p.name, due_date: "",
        status: "Open", waiting_on: "", blocked_by: "", decision_type: "", last_updated: todayIso() };
      o.tasks.push(t);
      save("");
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
      save(`Noted: ${el.dataset.name} is ${existing.name}.`);
      return drawTasks();
    }
    case "new-person": {
      const form = root.querySelector('form[data-form="add-person"]');
      const f = new FormData(form);
      return addPerson(el.dataset.name, String(f.get("email") ?? "").trim(), String(f.get("area") ?? ""));
    }
    default: return;
  }
  save("");
  drawTasks();
}

// --- This week --------------------------------------------------------------------

function drawWeek() {
  root.innerHTML = weekScreen(cur(), {
    suggestedWeek: weekly.lastSunday(), message, uploads, cosEmail: cosEmail(), scope: route.scope,
    googleLink: weekly.reminderGoogleLink(cur(), cosEmail()),
  });
  document.title = "This week, Chief of Staff briefing";
}

/** Every linked Google Sheet, fetched now. Only the sheet is requested from
Google; nothing from this page is sent. */
async function fetchLinked() {
  const o = cur();
  const links = [
    ...o.setup.areas.filter((a) => a.sheetLink).map((a) => ({ name: `${a.name} metrics (Google Sheet)`, url: a.sheetLink })),
    ...o.people.filter((p) => p.sheetLink).map((p) => ({ name: `${p.name} tasks (Google Sheet)`, url: p.sheetLink })),
  ];
  message = "Fetching…";
  drawWeek();
  const got = [];
  for (const l of links) {
    try {
      const res = await fetch(l.url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      got.push({ name: l.name, text: await res.text() });
    } catch {
      uploads.push({ name: l.name, error: true,
        summary: "couldn't be fetched. Check the sheet is still published to the web as CSV, and the link in setup." });
    }
  }
  message = "";
  return readUploads(got);
}

/** files: dropped File objects, or { name, text } already fetched. */
async function readUploads(files) {
  const o = cur();
  for (const f of files) {
    let tables;
    try {
      const content = f.text && typeof f.text === "string" ? f.text
        : /\.(xlsx|xls)$/i.test(f.name) ? new Uint8Array(await f.arrayBuffer()) : await f.text();
      tables = readTables(f.name.endsWith("(Google Sheet)") ? `${f.name}.csv` : f.name, content);
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
        detail: read.rows.map((r) => {
          const def = o.setup.areas.find((a) => a.name === r.area)?.metrics.find((m) => m.name.toLowerCase() === r.metric.toLowerCase());
          const missingCount = def?.minCount && r.value !== "" && !r.count;
          return `${r.metric}: ${r.value || "blank"}${r.count ? ` (from ${r.count})` : ""}${missingCount
            ? `. No count given: it needs at least ${def.minCount} to be judged, so it will show as too few to judge.` : ""}`;
        }) });
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
  const o = cur();
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
  save("");
  drawWeek();
}

function weekClick(el, ev) {
  const o = cur();
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
      return download("weekly-reminder.ics", weekly.reminderIcs(o, cosEmail()), "text/calendar");
    case "apply-upload":
      return applyUpload(uploads[Number(el.dataset.i)]);
    case "fetch-linked":
      return fetchLinked();
    default:
  }
}

// --- Events -----------------------------------------------------------------------

const onBriefing = () => route.screen === "briefing";

root.addEventListener("input", (ev) => {
  if (route.screen === "setup") setupInput(ev.target);
});

root.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.dataset.act === "import-file" && el.files[0]) return importBackup(el.files[0]);
  if (route.screen === "setup") return setupInput(el);
  if (route.screen === "tasks") return taskChange(el);
  if (route.screen === "week") {
    if (el.name === "files") readUploads([...el.files]);
    return;
  }
  if (!onBriefing()) return;
  const { act, id } = el.dataset;
  if (act !== "done" && act !== "due") return;
  if (!(act === "done" ? el.checked : el.value)) return;
  // A task is changed where it lives: in the live list.
  const t = cur().tasks.find((x) => x.id === id);
  if (!t) return;
  if (act === "done") t.status = "Done";
  else t.due_date = el.value;
  t.last_updated = todayIso();
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
    if (cur().people.some((p) => p.name === name)) { message = `${name} is already on the list.`; return drawTasks(); }
    if (email && !isEmail(email)) { message = "That doesn't look like an email address."; return drawTasks(); }
    const matches = likelyMatches(name, cur().people);
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
      weekly.startWeek(cur(), String(f.get("week")));
    } catch (err) {
      message = err.message;
      return drawWeek();
    }
    uploads = [];
    save("Week started. Send the requests below.");
    return drawWeek();
  }
  if (!onBriefing()) return;
  if (kind.startsWith("decide-")) {
    const words = String(f.get("text") ?? "").trim();
    const answer = { "decide-no": words ? `No: ${words}` : "No", "decide-chose": `Chose: ${words}`,
      "decide-decided": `Decided: ${words}`, "decide-ask": null }[kind];
    return kind === "decide-ask" ? askQuestion(form.dataset, words) : recordDecision(form.dataset.id, answer);
  }
  const text = String(f.get("text") ?? "").trim();
  if (!text) return;
  if (kind === "note") {
    const { taskId, area, title, label, owner } = form.dataset;
    cur().notes = [...cur().notes, newNote({ taskId, area, title, label, owner, from: String(f.get("from")), text, week: shownWeek() })];
    commit("", false);
  } else if (kind === "reply") {
    const note = cur().notes.find((n) => n.id === form.dataset.id);
    cur().notes = cur().notes.map((n) => (n === note ? { ...n, reply: { text, at: new Date().toISOString() } } : n));
    // The answer to the boss's question: the decision is back with the boss.
    const t = note?.question && cur().tasks.find((x) => x.id === note.taskId);
    if (t && t.waiting_on === t.owner) {
      t.waiting_on = cur().setup.boss;
      t.last_updated = todayIso();
      return commit(`${t.owner.split(" ")[0]}'s answer is in: the decision is back with the ${cur().setup.boss}.`);
    }
    commit("", false);
  }
});

/** A draft to the owner telling them what the boss said. */
function draftToOwner(t, text) {
  const email = cur().people.find((p) => p.name === t.owner)?.email;
  const item = briefings.at(-1)?.allCommitments.find((c) => c.id === t.id);
  if (!email || !item) return null;
  return emailDraft({ to: email, cc: cosEmail(), owner: t.owner, item, note: { from: "boss", text },
    weekEnding: toIso(briefings.at(-1).weekEnding), flags: [], areaKind: cur().setup.areaKind, boss: cur().setup.boss });
}

/** The boss's answer, recorded. Yes or a choice: the owner carries it out.
No: it closes, with the reason. */
function recordDecision(id, answer) {
  const t = cur().tasks.find((x) => x.id === id);
  if (!t) return;
  const href = draftToOwner(t, answer);
  t.decision = answer;
  t.decided_on = todayIso();
  t.last_updated = todayIso();
  t.waiting_on = "";
  t.status = answer.startsWith("No") ? "Done" : "In progress";
  const who = t.owner.split(" ")[0];
  notice = { text: t.status === "Done" ? `Recorded: ${answer}. It closes.` : `Recorded: ${answer}. Now with ${who} to carry out.`,
    href, label: `Draft email to ${who}` };
  commit("");
}

/** The boss sends it back with a question: it waits on the owner until they answer. */
function askQuestion(d, question) {
  const t = cur().tasks.find((x) => x.id === d.id);
  if (!t || !question) return;
  cur().notes = [...cur().notes, newNote({ taskId: t.id, area: t.area, title: d.title, label: d.label, owner: t.owner,
    from: "boss", text: question, week: shownWeek(), question: true })];
  const href = draftToOwner(t, question);
  t.waiting_on = t.owner;
  t.last_updated = todayIso();
  const who = t.owner.split(" ")[0];
  notice = { text: `Sent back to ${who}. It waits on them until their answer is added to the question below.`,
    href, label: `Draft email to ${who}` };
  commit("");
}

root.addEventListener("click", (ev) => {
  const draft = ev.target.closest('a[data-act="email"]');
  if (draft && onBriefing()) {
    // Let the link open the reader's email app, then record that a draft was opened.
    const id = draft.dataset.id;
    setTimeout(() => {
      cur().notes = cur().notes.map((n) => (n.id === id ? { ...n, emailed: true } : n));
      commit("", false);
    }, 0);
    return;
  }
  const el = ev.target.closest("button, a[data-act]");
  if (!el) return;
  const { act } = el.dataset;
  if (act === "export") {
    const name = route.scope === "own" ? "briefing-backup" : "briefing-example-backup";
    download(`${name}-${todayIso()}.json`, store.backupBlob(route.scope, cur()));
    return;
  }
  if (act === "import") return root.querySelector('[data-act="import-file"]').click();
  if (act === "reset") return reset();
  if (route.screen === "setup") return setupClick(el);
  if (route.screen === "tasks") return tasksClick(el);
  if (route.screen === "week") return weekClick(el, ev);
  if (!onBriefing()) return;

  if (act === "decide-yes") return recordDecision(el.dataset.id, "Yes, go ahead");
  if (el.dataset.week) {
    go(to("briefing", el.dataset.week));
    window.scrollTo(0, 0);
  } else if (act === "delete-note") {
    if (confirm("Delete this note and its reply?")) {
      cur().notes = cur().notes.filter((n) => n.id !== el.dataset.id);
      commit("", false);
    }
  } else if (act === "delete-reply") {
    cur().notes = cur().notes.map((n) => (n.id === el.dataset.id ? { ...n, reply: null } : n));
    commit("", false);
  } else if (act === "remove-week") {
    if (!confirm(`Undo starting the week ending ${el.dataset.target}? Its numbers are dropped; tasks stay as they are now.`)) return;
    const o = cur();
    o.weeks.pop();
    if (o.weeks.length) o.weeks.at(-1).tasks = null;
    save("");
    go(to(hasWeek() ? "briefing" : "week"));
  }
});

function reset() {
  if (route.scope === "example") {
    if (!confirm("Reset the example to how it started? Your changes to it are lost.")) return;
    store.deleteWorkspace("example");
    ws.example = null;
    return go("#/example");
  }
  if (!confirm("Delete your setup, people, tasks, weeks and notes from this browser? This can't be undone unless you exported a backup.")) return;
  store.deleteWorkspace("own");
  ws.own = store.cleanWorkspace("own", {});
  go("#/");
}

async function importBackup(file) {
  let incoming;
  try {
    incoming = store.parseBackup(await file.text());
  } catch (err) {
    alert(err.message);
    return;
  }
  const where = incoming.id === "own" ? "your company's data" : "the example";
  if (!confirm(`Replace ${where} in this browser with the backup?`)) return;
  ws[incoming.id] = incoming.state;
  store.saveWorkspace(incoming.id, incoming.state);
  const scope = incoming.id;
  go(link(scope, incoming.state.weeks.length ? "briefing" : "tasks"));
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
