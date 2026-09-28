/* The reader's changes, kept in this browser's own storage and nowhere else.
Nothing here talks to a server. A backup is a JSON file the reader saves
and can load again, in this browser or another.

An edit: { week, unit, title, label, done, due, at }. week is the week-ending
date, title the item's title as the engine matches it (engine/rules.js:
itemTitle), label the same title as written, for showing on the page. due is
"YYYY-MM-DD" or null, at when the change was made.
*/
const KEY = "cos-briefing:v1";
const FORMAT = "chief-of-staff-briefing backup";

/** Returns { edits, saved }. saved is false when the browser blocks storage
(some private windows do), so changes last only until the page closes. */
export function load() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
    localStorage.setItem(KEY + ":probe", "1");
    localStorage.removeItem(KEY + ":probe");
  } catch {
    return { edits: [], saved: false };
  }
  try {
    return { edits: raw ? clean(JSON.parse(raw).edits) : [], saved: true };
  } catch {
    return { edits: [], saved: true };   // damaged entry: start clean rather than break the page
  }
}

export function save(edits) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, edits }));
    return true;
  } catch {
    return false;
  }
}

/** Keep only well-formed edits, so a hand-edited or damaged file can't break the page. */
function clean(list) {
  if (!Array.isArray(list)) throw new Error("No list of changes found.");
  return list
    .filter((e) => e && typeof e.week === "string" && typeof e.unit === "string" && typeof e.title === "string")
    .map((e) => ({
      week: e.week, unit: e.unit, title: e.title,
      label: typeof e.label === "string" ? e.label : e.title,
      done: e.done === true,
      due: typeof e.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.due) ? e.due : null,
      at: typeof e.at === "string" ? e.at : null,
    }))
    .filter((e) => e.done || e.due);
}

/** Add or change one item's edit. Passing done: false and due: null removes it. */
export function upsert(edits, week, unit, title, change) {
  const rest = edits.filter((e) => !(e.week === week && e.unit === unit && e.title === title));
  const old = edits.find((e) => e.week === week && e.unit === unit && e.title === title);
  const next = { week, unit, title, done: false, due: null, ...old, ...change, at: new Date().toISOString() };
  return next.done || next.due ? [...rest, next] : rest;
}

/** { week ending: [edit] }, the shape the engine takes. */
export function byWeek(edits) {
  const out = {};
  for (const e of edits) (out[e.week] ??= []).push(e);
  return out;
}

export function backupBlob(edits) {
  const body = { format: FORMAT, version: 1, exported: new Date().toISOString(), edits };
  return new Blob([JSON.stringify(body, null, 2) + "\n"], { type: "application/json" });
}

export function parseBackup(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a backup from this page. It isn't valid JSON.");
  }
  if (body?.format !== FORMAT) throw new Error("That file isn't a backup from this page.");
  return clean(body.edits);
}
