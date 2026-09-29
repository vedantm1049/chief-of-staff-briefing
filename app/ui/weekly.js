/* The weekly routine for the reader's own company, as plain functions:
starting a week, the Excel sheet each area leader and each person fills in,
reading those sheets back, and the request emails and calendar reminder.

The page never sends anything. Requests open as drafts in the reader's own
email app; the reminder is a calendar file or a Google Calendar link the
reader saves themselves.
*/
import * as XLSX from "../vendor/xlsx-0.20.3.mjs";
import { fmtLong, parseIsoDate, toIso } from "../engine/dates.js";
import { cleanTasks, newId, TASK_COLUMNS } from "./store.js";

export const METRIC_SHEET_COLUMNS = ["area", "metric", "unit", "target", "better", "value", "count"];
// A person's sheet: every task column except the CEO's recorded decision.
export const TASK_SHEET_COLUMNS = TASK_COLUMNS.filter((c) => c !== "decision" && c !== "decided_on");
const DONE = new Set(["done", "complete", "completed", "closed", "resolved"]);

const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] || "there";

// --- Weeks ------------------------------------------------------------------------

export function currentWeek(own) {
  return own.weeks.at(-1) ?? null;
}

/** Weeks in the shape the engine takes. The current week reads the live list. */
export function weeksForEngine(own) {
  return own.weeks.map((w) => ({ weekEnding: w.weekEnding, tasks: w.tasks ?? own.tasks, metrics: w.metrics }));
}

/** Start reporting on a new week. The week before is frozen as it stands, and
tasks already done drop off the live list: they are on record in that week. */
export function startWeek(own, weekEnding) {
  if (!parseIsoDate(weekEnding)) throw new Error("Pick the week-ending date.");
  const current = currentWeek(own);
  if (current && weekEnding <= current.weekEnding) {
    throw new Error(`Weeks go forward: the current week ends ${current.weekEnding}.`);
  }
  if (current) current.tasks = own.tasks.map((t) => ({ ...t }));
  own.tasks = own.tasks.filter((t) => !DONE.has(String(t.status).trim().toLowerCase()));
  own.weeks.push({ weekEnding, tasks: null, metrics: [], received: { metrics: [], tasks: [] } });
  return own;
}

/** Every area leader is also a person who can own tasks. A leader not yet on
the people list is added; one already there gets any missing email or area. */
export function syncLeaders(own) {
  for (const a of own.setup.areas) {
    const { name, email } = a.leader;
    if (!name) continue;
    const p = own.people.find((x) => x.name === name || x.spellings.includes(name));
    if (!p) own.people.push({ name, email, area: a.name, spellings: [] });
    else {
      if (!p.email && email) p.email = email;
      if (!p.area) p.area = a.name;
    }
  }
  return own;
}

/** The people list as rows for the engine's owner table. */
export function peopleRows(people) {
  const rows = [];
  for (const p of people) {
    rows.push({ raw_name: p.name, area: "", normalized_owner: p.name, email: p.email });
    for (const s of p.spellings) rows.push({ raw_name: s, area: "", normalized_owner: p.name, email: p.email });
  }
  return rows;
}

export function openTasksOf(own, person) {
  return own.tasks.filter((t) => t.owner === person.name && !DONE.has(String(t.status).trim().toLowerCase()));
}

// --- Sheets -----------------------------------------------------------------------

function workbook(title, header, rows, howTo, widths) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  const help = XLSX.utils.aoa_to_sheet(howTo.map((line) => [line]));
  help["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, help, "How to fill it in");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

/** An area leader's sheet: their metrics, one row each, value to fill in.
The same sheet serves every week. */
export function metricSheet(area) {
  const rows = area.metrics.map((m) => [area.name, m.name, m.unit, m.target ?? "",
    m.better === "lower" ? "lower is better" : "higher is better", "", ""]);
  return workbook(`Metrics`, METRIC_SHEET_COLUMNS, rows, [
    `${area.name}: last week's numbers.`,
    "Fill in the value column for each metric, for the week just ended. Leave the other columns as they are.",
    "count: where a number rests on responses, like a customer rating, how many ratings it is based on. Without it, that number can't be judged.",
    "Send the file back to the Chief of Staff by Wednesday. The same file works every week.",
  ], [18, 26, 12, 12, 18, 12, 10]);
}

/** A person's sheet: their open tasks, as they stand on the page now. */
export function taskSheet(own, person) {
  const rows = openTasksOf(own, person).map((t) => TASK_SHEET_COLUMNS.map((c) => t[c] ?? ""));
  return workbook(`Tasks`, TASK_SHEET_COLUMNS, rows, [
    `${person.name}: your open tasks.`,
    "Update status (Open, In progress, Waiting on decision, Done), due_date (YYYY-MM-DD) and last_updated (the last day you moved it).",
    "For a decision: waiting_on is who it waits on, decision_type is Yes or no, Pick an option, or Open question.",
    "blocked_by is the title of another task this one can't move without.",
    "Add a row for a new task (leave id empty). Delete a row only if the task no longer exists; it will show as removed, not done.",
    "Don't change the id column. Send the file back to the Chief of Staff by Wednesday.",
  ], [16, 18, 50, 18, 12, 20, 18, 22, 16, 13]);
}

/** Which sheet a returned table is, by its columns. */
export function sheetKind(headers) {
  const h = new Set(headers.map((x) => String(x).trim().toLowerCase()));
  if (["area", "metric", "value"].every((c) => h.has(c))) return "metrics";
  if (["id", "task", "owner"].every((c) => h.has(c))) return "tasks";
  return null;
}

const text = (v) => (v == null ? "" : String(v).trim());
const lower = (v) => text(v).toLowerCase();

/** A leader's returned sheet, as metric rows for one area. Targets come from
setup, not the sheet, so an edited target in a returned file changes nothing. */
export function readMetricSheet(table, setup) {
  const areaNames = new Map(setup.areas.map((a) => [lower(a.name), a.name]));
  const rows = table.rows
    .map((r) => {
      const get = (k) => r[Object.keys(r).find((x) => lower(x) === k)];
      return { area: areaNames.get(lower(get("area"))) ?? text(get("area")), metric: text(get("metric")),
        segment: "", value: text(get("value")), target: "", count: text(get("count")) };
    })
    .filter((r) => r.metric);
  const areas = [...new Set(rows.map((r) => r.area))];
  const unknown = areas.filter((a) => !setup.areas.some((x) => x.name === a));
  return { rows, areas, unknown };
}

/** What a person's returned sheet would change in the live list, before it is applied. */
export function diffTaskSheet(own, table, today) {
  const rows = table.rows.map((r) => {
    const out = {};
    for (const c of TASK_SHEET_COLUMNS) out[c] = text(r[Object.keys(r).find((x) => lower(x) === c)]);
    return out;
  }).filter((r) => r.task || r.id);
  const owners = [...new Set(rows.map((r) => r.owner).filter(Boolean))];
  const person = own.people.find((p) => owners.includes(p.name) || p.spellings.some((s) => owners.includes(s)));
  if (!person) return { person: null, owners, updated: [], added: [], removed: [], unchanged: 0 };

  const byId = new Map(own.tasks.map((t) => [t.id, t]));
  const updated = [], added = [];
  let unchanged = 0;
  const seen = new Set();
  const fields = TASK_SHEET_COLUMNS.filter((c) => !["id", "owner", "last_updated"].includes(c));
  for (const r of rows) {
    const before = r.id && byId.get(r.id);
    if (before && before.owner === person.name) {
      seen.add(before.id);
      const changed = fields.filter((f) => text(before[f]) !== r[f]);
      const stated = parseIsoDate(r.last_updated) != null ? r.last_updated : before.last_updated;
      // Touched when they say so, or when anything on the row changed.
      const lastUpdated = changed.length && (!stated || stated < today) ? today : stated;
      if (changed.length || lastUpdated !== before.last_updated) {
        updated.push({ before, after: { ...before, ...Object.fromEntries(fields.map((f) => [f, r[f]])), last_updated: lastUpdated }, changed });
      } else {
        unchanged++;
      }
    } else if (r.task) {
      added.push({ ...r, id: newId(), owner: person.name, area: r.area || person.area,
        last_updated: parseIsoDate(r.last_updated) != null ? r.last_updated : today });
    }
  }
  const removed = openTasksOf(own, person).filter((t) => !seen.has(t.id));
  return { person, owners, updated, added, removed, unchanged };
}

export function applyTaskDiff(own, diff) {
  const after = new Map(diff.updated.map((u) => [u.before.id, u.after]));
  const gone = new Set(diff.removed.map((t) => t.id));
  own.tasks = cleanTasks([...own.tasks.filter((t) => !gone.has(t.id)).map((t) => after.get(t.id) ?? t), ...diff.added]);
  return own;
}

// --- Requests and the reminder ----------------------------------------------------

function wednesdayAfter(weekEnding) {
  const d = parseIsoDate(weekEnding);
  return d == null ? null : d + 3;   // week ends on a Sunday: Wednesday is three days on
}

function mailto(to, subject, lines, cc) {
  const copy = cc ? `cc=${encodeURIComponent(cc)}&` : "";
  return `mailto:${encodeURIComponent(to)}?${copy}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

const fmtTarget = (m) => (m.target == null ? "no target set" : `target ${Number(m.target).toLocaleString("en-US")}`);

export function metricRequest(area, weekEnding) {
  const due = wednesdayAfter(weekEnding);
  const lines = [
    `Hi ${firstName(area.leader.name)},`,
    "",
    `Please send me the numbers for ${area.name} for the week ending ${fmtLong(parseIsoDate(weekEnding))}, by ${fmtLong(due)}.`,
    "",
    "Fill in the value column of your metrics sheet (the same one every week) and send it back. The numbers I need:",
    ...area.metrics.map((m) => `- ${m.name}${m.unit ? ` (${m.unit})` : ""}, ${fmtTarget(m)}${m.minCount ? ", and how many responses it is based on" : ""}`),
    "",
    "Thank you.",
  ];
  return mailto(area.leader.email, `${area.name} numbers for the week ending ${fmtLong(parseIsoDate(weekEnding))}`, lines);
}

export function taskRequest(own, person, weekEnding) {
  const due = wednesdayAfter(weekEnding);
  const tasks = openTasksOf(own, person);
  const lines = [
    `Hi ${firstName(person.name)},`,
    "",
    `Please update your open tasks for the week ending ${fmtLong(parseIsoDate(weekEnding))}, by ${fmtLong(due)}: status, due dates, anything new. Update the attached sheet and send it back, or reply with the changes.`,
    "",
    tasks.length ? "Your open tasks:" : "You have no open tasks on my list. Reply with anything new.",
    ...tasks.map((t) => `- ${t.task}${t.due_date ? `, due ${t.due_date}` : ""}${t.status ? `, ${t.status}` : ""}`),
    "",
    "Thank you.",
  ];
  return mailto(person.email, `Your tasks for the week ending ${fmtLong(parseIsoDate(weekEnding))}`, lines);
}

/** Everyone who is asked for something each week, with an email. */
export function reminderGuests(own) {
  const emails = [...own.setup.areas.map((a) => a.leader.email), ...own.people.map((p) => p.email)].filter(Boolean);
  return [...new Set(emails.map((e) => e.toLowerCase()))];
}

function nextMonday(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}

const stamp = (d, h, m) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;

function reminderText(own, cosEmail) {
  return {
    title: `Weekly: send last week's numbers and task updates to the Chief of Staff`,
    details: `Every Monday. By Wednesday, send ${cosEmail || "the Chief of Staff"} last week's numbers (${own.setup.areaKind || "area"} leaders, in your metrics sheet) and your task updates (in your tasks sheet).`,
  };
}

/** A recurring Monday reminder as a calendar file, with everyone as a guest. */
export function reminderIcs(own, cosEmail, from = new Date()) {
  const { title, details } = reminderText(own, cosEmail);
  const start = nextMonday(from);
  const esc = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//chief-of-staff-briefing//EN", "METHOD:REQUEST", "BEGIN:VEVENT",
    `UID:${newId("r")}@chief-of-staff-briefing`, `DTSTAMP:${stamp(from, 0, 0)}`,
    `DTSTART:${stamp(start, 9, 0)}`, `DTEND:${stamp(start, 9, 15)}`, "RRULE:FREQ=WEEKLY;BYDAY=MO",
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(details)}`,
    ...(cosEmail ? [`ORGANIZER:mailto:${cosEmail}`] : []),
    ...reminderGuests(own).map((e) => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${e}`),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** The same reminder as a Google Calendar link. Opens the reader's calendar
with the event filled in; nothing is created until they save it there. */
export function reminderGoogleLink(own, cosEmail, from = new Date()) {
  const { title, details } = reminderText(own, cosEmail);
  const start = nextMonday(from);
  const q = new URLSearchParams({
    action: "TEMPLATE", text: title, details,
    dates: `${stamp(start, 9, 0)}/${stamp(start, 9, 15)}`,
    recur: "RRULE:FREQ=WEEKLY;BYDAY=MO",
    add: reminderGuests(own).join(","),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function lastSunday(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - d.getDay());
  return toIso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
