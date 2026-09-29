/* Turning whatever the teams sent into template rows: a template file, an
Excel workbook, a CSV in their own shape, or a table pasted from a
spreadsheet. Columns that don't match the template are matched once by the
reader on the page, and the match is remembered for next time.

Nothing here guesses a person or an area. New owner names and unknown areas
are listed so the reader can say who or what they are.
*/
import { parseCsv, readWorkbook } from "../engine/parse.js";

export const TASK_FIELDS = [
  { key: "area", label: "Area", hint: "which area the task belongs to" },
  { key: "task", label: "Task", hint: "what the task is", required: true },
  { key: "owner", label: "Owner", hint: "who owns it", required: true },
  { key: "due_date", label: "Due date" },
  { key: "status", label: "Status", hint: "Open, In progress, Waiting on decision or Done" },
  { key: "waiting_on", label: "Waiting on", hint: "who a decision waits on" },
  { key: "blocked_by", label: "Blocked by", hint: "the title of another task it waits for" },
  { key: "decision_type", label: "Decision type", hint: "Yes or no, Pick an option, Open question" },
  { key: "last_updated", label: "Last updated" },
];

export const METRIC_FIELDS = [
  { key: "area", label: "Area" },
  { key: "metric", label: "Metric", hint: "the rule reads Customer rating" },
  { key: "segment", label: "Segment", hint: "a city or store, if the area reports several" },
  { key: "value", label: "Value", required: true },
  { key: "target", label: "Target" },
  { key: "count", label: "Count", hint: "how many ratings" },
];

export const FIELDS = { tasks: TASK_FIELDS, metrics: METRIC_FIELDS };

// Other names people give the same column. Compared after lowercasing and
// turning spaces, dashes and dots into underscores.
const SYNONYMS = {
  area: ["unit", "department", "dept", "business", "business_line", "team", "division", "brand", "vertical"],
  task: ["description", "item", "title", "action", "action_item", "commitment", "task_name", "deliverable"],
  owner: ["assignee", "assigned_to", "responsible", "owner_name", "lead", "dri"],
  due_date: ["due", "deadline", "target_date", "due_by", "eta"],
  status: ["state", "progress"],
  waiting_on: ["waiting_for", "approver", "decision_by", "decision_owner", "needs_sign_off_from"],
  blocked_by: ["blocker", "depends_on", "dependency", "blocked"],
  decision_type: ["decision", "type_of_decision"],
  last_updated: ["updated", "last_update", "last_touched", "updated_on", "modified", "last_modified"],
  metric: ["kpi", "measure", "metric_name"],
  segment: ["city", "store", "region", "site", "location", "cluster"],
  value: ["actual", "score", "rating", "result"],
  target: ["goal", "plan"],
  count: ["responses", "ratings", "sample", "sample_size", "n", "rated_count"],
};

export function normHeader(h) {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-./]+/g, "_").replace(/^_+|_+$/g, "");
}

/** A file's column set, used to remember how its columns were matched. */
export function signature(headers) {
  return headers.map(normHeader).filter(Boolean).sort().join("|");
}

/** File contents to tables: [{ name, headers, rows: [objects] }]. A CSV or a
paste is one table; an Excel workbook gives one per non-empty sheet. */
export function readTables(fileName, content) {
  if (/\.(xlsx|xls)$/i.test(fileName)) {
    const sheets = readWorkbook(content);
    return Object.entries(sheets)
      .filter(([, rows]) => rows.length)
      .map(([sheet, rows]) => ({
        name: Object.keys(sheets).length > 1 ? `${fileName}, ${sheet}` : fileName,
        headers: Object.keys(rows[0]),
        rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cell(v)]))),
      }));
  }
  const text = String(content ?? "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const [header = [], ...body] = parseCsv(text, delimiter);
  const headers = header.map((h) => h.trim());
  if (!headers.some(Boolean)) return [];
  return [{
    name: fileName,
    headers,
    rows: body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]))),
  }];
}

/** An Excel cell as text. Dates become YYYY-MM-DD. */
function cell(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    // Round to the nearest day: Excel dates can land a few seconds off midnight.
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return String(v).trim();
}

export function guessKind(headers) {
  const h = new Set(headers.map(normHeader));
  const metricish = ["metric", "value", "kpi", "rating", "score", "actual"].filter((x) => h.has(x)).length;
  const taskish = ["task", "owner", "description", "assignee", "item", "due_date", "due"].filter((x) => h.has(x)).length;
  return metricish > taskish ? "metrics" : "tasks";
}

/** Best first match of the file's columns to the template's fields: exact
names, then the common other names above. The reader confirms or changes it. */
export function autoMatch(headers, kind) {
  const columns = {};
  const used = new Set();
  for (const field of FIELDS[kind]) {
    const names = [field.key, normHeader(field.label), ...(SYNONYMS[field.key] ?? [])];
    const hit = headers.find((h) => !used.has(h) && names.includes(normHeader(h)));
    if (hit) { columns[field.key] = hit; used.add(hit); }
  }
  return columns;
}

/** True when every template column is there under its template name. */
export function isTemplate(headers, kind) {
  const h = new Set(headers.map(normHeader));
  return FIELDS[kind].every((f) => h.has(f.key));
}

/** What still needs the reader before the table can be used. */
export function mappingProblems(mapping, kind) {
  const problems = [];
  for (const f of FIELDS[kind]) if (f.required && !mapping.columns[f.key]) problems.push(`Pick the column for ${f.label}.`);
  if (!mapping.columns.area && !mapping.area) problems.push("Pick the column for Area, or say which area this whole file is for.");
  return problems;
}

/** A table's rows in the template's columns. */
export function applyMapping(table, mapping) {
  return table.rows
    .map((row) => {
      const out = {};
      for (const f of FIELDS[mapping.kind]) out[f.key] = mapping.columns[f.key] ? String(row[mapping.columns[f.key]] ?? "").trim() : "";
      if (!out.area && mapping.area) out.area = mapping.area;
      if (mapping.kind === "metrics" && !out.metric) out.metric = "Customer rating";
      return out;
    })
    .filter((r) => Object.entries(r).some(([k, v]) => k !== "area" && k !== "metric" && v));
}

/** The owner list as rows for the engine's owner table. */
export function ownerRows(owners) {
  const rows = [];
  for (const o of owners) {
    rows.push({ raw_name: o.name, area: "", normalized_owner: o.name, email: o.email });
    for (const s of o.spellings) rows.push({ raw_name: s, area: "", normalized_owner: o.name, email: o.email });
  }
  return rows;
}

/** Owner names in these rows that the owner list has never seen. */
export function newOwnerNames(rows, owners) {
  const known = new Set(owners.flatMap((o) => [o.name, ...o.spellings]).map((n) => n.trim()));
  const out = [];
  for (const r of rows) {
    const n = String(r.owner ?? "").trim();
    if (n && !known.has(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Owners who might be the same person, listed first for the reader to
check: they share a name word, or an initial matches a first name. Only an
ordering to save scrolling; the reader decides. */
export function likelyMatches(name, owners) {
  const words = (s) => s.toLowerCase().replace(/\./g, " ").split(/\s+/).filter(Boolean);
  const mine = words(name);
  return owners.filter((o) => {
    const theirs = words(o.name);
    return mine.some((w) => w.length > 1 && theirs.includes(w))
      || mine.some((w) => w.length === 1 && theirs.some((t) => t.startsWith(w)) && mine.some((x) => x.length > 1 && theirs.includes(x)));
  });
}

/** Area names in these rows that aren't in the setup. */
export function unknownAreaNames(rows, areas) {
  const known = new Set(areas.map((a) => a.name.trim().toLowerCase()));
  const out = [];
  for (const r of rows) {
    const n = String(r.area ?? "").trim();
    if (n && !known.has(n.toLowerCase()) && !out.includes(n)) out.push(n);
  }
  return out;
}

function csvLine(cells) {
  return cells.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
}

/** Blank templates, with the reader's areas filled in so each team can see its name. */
export function templateFiles(setup) {
  const areas = setup.areas.length ? setup.areas.map((a) => a.name) : ["Your area"];
  const tasks = [TASK_FIELDS.map((f) => f.key), ...areas.map((a) => [a, "", "", "", "", "", "", "", ""])];
  const metrics = [METRIC_FIELDS.map((f) => f.key), ...areas.map((a) => [a, "Customer rating", "", "", "", ""])];
  return {
    "tasks-template.csv": tasks.map(csvLine).join("\n") + "\n",
    "metrics-template.csv": metrics.map(csvLine).join("\n") + "\n",
  };
}
