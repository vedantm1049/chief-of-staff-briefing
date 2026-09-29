/* Everything the reader keeps, in this browser's own storage and nowhere
else. Nothing here talks to a server. A backup is a JSON file the reader
saves and can load again, in this browser or another.

Two workspaces, kept apart:
  example: the Wasla sample. Only the reader's edits, notes and settings are
    stored; the sample itself is read from data/.
  own: the reader's company. Setup, owners, every week's rows, remembered
    column matches, edits, notes and settings.

An edit: { week, area, title, label, done, due, at }. week is the week-ending
date, title the item's title as the engine matches it (engine/rules.js:
itemTitle), label the same title as written, for showing on the page. due is
"YYYY-MM-DD" or null, at when the change was made. Notes: see notes.js.
*/
import { cleanNotes, isEmail } from "./notes.js";

const KEYS = { example: "cos-briefing:v1", own: "cos-briefing:own:v1" };
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

export function hasOwn() {
  try {
    return localStorage.getItem(KEYS.own) != null;
  } catch {
    return false;
  }
}

/** A workspace's stored state, cleaned, with defaults for anything missing. */
export function loadWorkspace(id) {
  let body = {};
  try {
    const raw = localStorage.getItem(KEYS[id]);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};   // blocked or damaged: start clean rather than break the page
  }
  return cleanWorkspace(id, body);
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

export function cleanWorkspace(id, body) {
  const base = {
    edits: cleanEdits(body.edits),
    notes: cleanNotes(body.notes),
    settings: cleanSettings(body.settings),
  };
  if (id !== "own") return base;
  return {
    ...base,
    setup: cleanSetup(body.setup),
    owners: cleanOwners(body.owners),
    weeks: cleanWeeks(body.weeks),
    mappings: cleanMappings(body.mappings),
  };
}

/** Settings the reader can change. cosEmail: copied on every email draft. */
export function cleanSettings(s) {
  return { cosEmail: isEmail(s?.cosEmail) ? s.cosEmail.trim() : null };
}

export function cleanSetup(s) {
  const areas = list(s?.areas)
    .map((a) => ({ name: str(a?.name), tier: TIERS.includes(a?.tier) ? a.tier : "Core" }))
    .filter((a) => a.name);
  return {
    company: str(s?.company),
    areaKind: str(s?.areaKind) || "area",
    boss: str(s?.boss) || "CEO",
    areas,
  };
}

/** Owners: { name, email, spellings: other ways their name is written }. */
export function cleanOwners(owners) {
  return list(owners)
    .map((o) => ({
      name: str(o?.name),
      email: isEmail(o?.email) ? o.email.trim() : "",
      spellings: list(o?.spellings).map(str).filter(Boolean),
    }))
    .filter((o) => o.name);
}

function cleanRows(rows) {
  return list(rows)
    .filter((r) => r && typeof r === "object")
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)])));
}

export function cleanWeeks(weeks) {
  return list(weeks)
    .filter((w) => ISO.test(w?.weekEnding))
    .map((w) => ({
      weekEnding: w.weekEnding,
      tasks: cleanRows(w.tasks),
      metrics: cleanRows(w.metrics),
      files: list(w.files).map(str).filter(Boolean),
    }))
    .sort((a, b) => (a.weekEnding < b.weekEnding ? -1 : 1));
}

/** Remembered column matches: { header signature: { kind, columns, area } }. */
export function cleanMappings(m) {
  const out = {};
  for (const [sig, v] of Object.entries(m && typeof m === "object" ? m : {})) {
    if (!v || !["tasks", "metrics"].includes(v.kind)) continue;
    const columns = {};
    for (const [field, header] of Object.entries(v.columns ?? {})) if (typeof header === "string") columns[field] = header;
    out[sig] = { kind: v.kind, columns, area: str(v.area) };
  }
  return out;
}

/** Keep only well-formed edits, so a hand-edited or damaged file can't break the page. */
function cleanEdits(edits) {
  return list(edits)
    .map((e) => (e && e.area == null && typeof e.unit === "string" ? { ...e, area: e.unit } : e))
    .filter((e) => e && typeof e.week === "string" && typeof e.area === "string" && typeof e.title === "string")
    .map((e) => ({
      week: e.week, area: e.area, title: e.title,
      label: typeof e.label === "string" ? e.label : e.title,
      done: e.done === true,
      due: typeof e.due === "string" && ISO.test(e.due) ? e.due : null,
      at: typeof e.at === "string" ? e.at : null,
    }))
    .filter((e) => e.done || e.due);
}

/** Add or change one item's edit. Passing done: false and due: null removes it. */
export function upsert(edits, week, area, title, change) {
  const rest = edits.filter((e) => !(e.week === week && e.area === area && e.title === title));
  const old = edits.find((e) => e.week === week && e.area === area && e.title === title);
  const next = { week, area, title, done: false, due: null, ...old, ...change, at: new Date().toISOString() };
  return next.done || next.due ? [...rest, next] : rest;
}

/** { week ending: [edit] }, the shape the engine takes. */
export function byWeek(edits) {
  const out = {};
  for (const e of edits) (out[e.week] ??= []).push(e);
  return out;
}

export function backupBlob(id, state) {
  const body = { format: FORMAT, version: 3, workspace: id, exported: new Date().toISOString(), ...state };
  return new Blob([JSON.stringify(body, null, 2) + "\n"], { type: "application/json" });
}

/** Returns { id, state }. Backups from before workspaces existed belong to the example. */
export function parseBackup(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a backup from this page. It isn't valid JSON.");
  }
  if (body?.format !== FORMAT) throw new Error("That file isn't a backup from this page.");
  const id = body.workspace === "own" ? "own" : "example";
  return { id, state: cleanWorkspace(id, body) };
}
