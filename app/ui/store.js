/* Everything the reader keeps, in this browser's own storage and nowhere
else. Nothing here talks to a server. A backup is a JSON file the reader
saves and can load again, in this browser or another.

Two workspaces, kept apart and the same shape:
  example: Wasla Group, a made-up company, first read from data/example.json.
    Once the reader changes anything it is kept here, until they reset it.
  own: the reader's company:
    setup    company, the boss's title, what areas are called, and each area
             with its tier, leader and metrics
    people   everyone who owns work: { name, email, area, spellings }
    tasks    the live task list, kept on the page: { id, area, task, owner,
             due_date, status, waiting_on, blocked_by, decision_type,
             last_updated, decision, decided_on }. decision is the CEO's
             answer as recorded on the page ("Yes, go ahead", "No: reason",
             "Chose: option two", "Decided: ..."), decided_on its date.
    weeks    { weekEnding, tasks, metrics, received }. The last week is the
             current one and reads the live list (its tasks are null). A
             finished week keeps a frozen copy, so history can be told.
    notes, settings

A note: see notes.js.
*/
import { cleanNotes, isEmail } from "./notes.js";

const KEYS = { example: "cos-briefing:example:v2", own: "cos-briefing:own:v1" };
const FORMAT = "chief-of-staff-briefing backup";
const TIERS = ["Flagship", "Core", "Experimental"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const str = (v) => (typeof v === "string" ? v.trim() : "");
const list = (v) => (Array.isArray(v) ? v : []);

/** True when this browser lets the page keep anything. Some private windows don't. */
export function storageWorks() {
  try {
    localStorage.setItem("cos-briefing:probe", "1");
    localStorage.removeItem("cos-briefing:probe");
    return true;
  } catch {
    return false;
  }
}

/** A workspace's stored state, cleaned, or null if nothing is stored. */
export function loadWorkspace(id) {
  try {
    const raw = localStorage.getItem(KEYS[id]);
    return raw ? cleanWorkspace(id, JSON.parse(raw)) : null;
  } catch {
    return null;   // blocked or damaged: start clean rather than break the page
  }
}

export function saveWorkspace(id, state) {
  try {
    localStorage.setItem(KEYS[id], JSON.stringify({ version: 3, ...state }));
    return true;
  } catch {
    return false;
  }
}

export function deleteWorkspace(id) {
  try {
    localStorage.removeItem(KEYS[id]);
  } catch {
    // nothing to remove
  }
}

export function cleanWorkspace(id, body = {}) {
  const base = { notes: cleanNotes(body.notes), settings: cleanSettings(body.settings) };
  const people = cleanPeople(body.people ?? body.owners);
  const weeks = cleanWeeks(body.weeks);
  let tasks = cleanTasks(body.tasks);
  // Data from before the live list: the latest week's rows become the live list.
  if (!Array.isArray(body.tasks) && weeks.length && weeks.at(-1).tasks) {
    tasks = cleanTasks(weeks.at(-1).tasks);
    weeks.at(-1).tasks = null;
  }
  return { ...base, setup: cleanSetup(body.setup), people, tasks, weeks };
}

/** Settings the reader can change. cosEmail: copied on every email draft. */
export function cleanSettings(s) {
  return { cosEmail: isEmail(s?.cosEmail) ? s.cosEmail.trim() : null };
}

/** A number as typed: "100,000", "1 200" and " 4.5 " all read. */
export function readNumber(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  const t = String(v).replace(/[,\s]/g, "");
  return t === "" || Number.isNaN(Number(t)) ? null : Number(t);
}
const num = readNumber;

/** A Google Sheet published to the web, as the link that returns CSV. Accepts
the publish link in its usual forms. Throws with a plain reason otherwise. */
export function sheetCsvLink(text) {
  const t = String(text ?? "").trim();
  let url;
  try {
    url = new URL(t);
  } catch {
    throw new Error("That isn't a web link.");
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !url.pathname.startsWith("/spreadsheets/")) {
    throw new Error("Use the link from Google Sheets: File, Share, Publish to web.");
  }
  if (!url.pathname.startsWith("/spreadsheets/d/e/")) {
    throw new Error("That is the sheet's own link, which needs a sign-in. Use File, Share, Publish to web, and choose CSV.");
  }
  url.pathname = url.pathname.replace(/\/pub(html)?$/, "/pub");
  url.searchParams.set("output", "csv");
  return url.toString();
}

function sheetLinkOrBlank(v) {
  try {
    return v ? sheetCsvLink(v) : "";
  } catch {
    return "";
  }
}

export function cleanMetric(m) {
  return {
    id: str(m?.id) || newId("m"),
    name: str(m?.name),
    unit: str(m?.unit),
    target: num(m?.target),
    better: m?.better === "lower" ? "lower" : "higher",
    margin: num(m?.margin) ?? 5,
    marginKind: m?.marginKind === "points" ? "points" : "percent",
    minCount: num(m?.minCount) || null,
  };
}

export function cleanSetup(s) {
  const areas = list(s?.areas)
    .map((a) => ({
      name: str(a?.name),
      tier: TIERS.includes(a?.tier) ? a.tier : "Core",
      leader: { name: str(a?.leader?.name), email: isEmail(a?.leader?.email) ? a.leader.email.trim() : "" },
      sheetLink: sheetLinkOrBlank(a?.sheetLink),
      metrics: list(a?.metrics).map(cleanMetric).filter((m) => m.name),
    }))
    .filter((a) => a.name);
  return {
    company: str(s?.company),
    areaKind: str(s?.areaKind) || "area",
    boss: str(s?.boss) || "CEO",
    areas,
  };
}

export function newId(prefix = "t") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** People who own work: { name, email, area, spellings: other ways their name is written }. */
export function cleanPeople(people) {
  return list(people)
    .map((o) => ({
      name: str(o?.name),
      email: isEmail(o?.email) ? o.email.trim() : "",
      area: str(o?.area),
      spellings: list(o?.spellings).map(str).filter(Boolean),
      sheetLink: sheetLinkOrBlank(o?.sheetLink),
    }))
    .filter((o) => o.name);
}

export const TASK_COLUMNS = ["id", "area", "task", "owner", "due_date", "status", "waiting_on", "blocked_by",
  "decision_type", "last_updated", "decision", "decided_on"];

function cleanRows(rows) {
  return list(rows)
    .filter((r) => r && typeof r === "object")
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)])));
}

/** Tasks always carry an id. */
export function cleanTasks(rows) {
  return cleanRows(rows)
    .map((r) => ({ ...Object.fromEntries(TASK_COLUMNS.map((c) => [c, r[c] ?? ""])), id: r.id || newId() }))
    .filter((r) => r.task || r.owner);
}

export function cleanWeeks(weeks) {
  return list(weeks)
    .filter((w) => ISO.test(w?.weekEnding))
    .map((w) => ({
      weekEnding: w.weekEnding,
      tasks: Array.isArray(w.tasks) ? cleanTasks(w.tasks) : null,
      metrics: cleanRows(w.metrics),
      received: {
        metrics: list(w.received?.metrics).map(str).filter(Boolean),
        tasks: list(w.received?.tasks).map(str).filter(Boolean),
      },
    }))
    .sort((a, b) => (a.weekEnding < b.weekEnding ? -1 : 1))
    .map((w, i, all) => (i < all.length - 1 && w.tasks == null ? { ...w, tasks: [] } : w));
}

export function backupBlob(id, state) {
  const body = { format: FORMAT, version: 3, workspace: id, exported: new Date().toISOString(), ...state };
  return new Blob([JSON.stringify(body, null, 2) + "\n"], { type: "application/json" });
}

/** Returns { id, state }. A backup of the example goes back to the example. */
export function parseBackup(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a backup from this page. It isn't valid JSON.");
  }
  if (body?.format !== FORMAT) throw new Error("That file isn't a backup from this page.");
  const id = body.workspace === "own" ? "own" : "example";
  if (!body.setup) throw new Error("That backup is from an older version of the example and can't be loaded.");
  return { id, state: cleanWorkspace(id, body) };
}
