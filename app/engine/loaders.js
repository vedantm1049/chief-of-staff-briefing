/* Reads template rows into one common record per task, and one rating per
area. It reads and normalizes. It scores nothing.

The template (docs/data_contract.md section 3):
  tasks:   area, task, owner, due_date, status, waiting_on, blocked_by,
           decision_type, last_updated
  metrics: area, metric, segment, value, target, count (read in metrics.js)

A task row may also carry an id: tasks kept on the page have one, and it
identifies the task across weeks even if its title is edited.
*/
import {
  normalizeStatus,
  inferStatusFromText,
  isDecisionPending,
  isBlockedOnPrincipal,
  parseDueDate,
} from "./normalize.js";
import { parseIsoDate } from "./dates.js";

/** Blank strings and NaN become null. */
function clean(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isNaN(v)) return null;
  if (typeof v === "string" && ["", "nan"].includes(v.trim())) return null;
  return v;
}

export function toFloat(v) {
  v = clean(v);
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function text(v) {
  return v == null ? "" : String(v).trim();
}

/** One tracked task. */
export function makeCommitment(fields) {
  return {
    id: "",                 // set for tasks kept on the page
    area: "",               // the area whose file lists the task, e.g. "Wasla Table"
    rawOwner: "",
    owner: "",              // after alias resolution
    description: "",        // the task as written; its title is the text before the first comma
    dueDateRaw: "",
    dueDate: null,
    dueDateApprox: false,   // parsed from free text
    statusRaw: null,
    status: "open",         // "open" | "done" | "pending_decision"
    statusInferred: false,  // status was blank, read from the task text
    lastUpdated: null,
    waitingOn: "",
    blockedBy: "",
    decisionType: "",
    decisionPending: false,
    principalBlocked: false,
    decision: "",           // the boss's answer, as recorded on the page
    decidedOn: null,
    movesMetric: "",        // the one of its area's metrics this task is meant to move
    ...fields,
  };
}

/** Area names match without regard to case or extra spaces. Returns the
setup's spelling, or null for an area the setup doesn't have. */
export function areaMatcher(areaNames) {
  const byKey = new Map(areaNames.map((n) => [n.trim().toLowerCase().replace(/\s+/g, " "), n]));
  return (name) => byKey.get(text(name).toLowerCase().replace(/\s+/g, " ")) ?? null;
}

/** Task rows to commitments, in the setup's area order, then row order.
Rows naming an area outside the setup are kept under the name they give,
and reported. */
export function loadTasks(rows, { areaNames, aliases, today, boss }) {
  const match = areaMatcher(areaNames);
  const unknownAreas = new Set();
  const out = rows
    .filter((row) => text(row.task) || text(row.owner))
    .map((row) => {
      const area = match(row.area) ?? text(row.area);
      if (!match(row.area)) unknownAreas.add(area || "(no area given)");
      const description = text(row.task);

      const statusRaw = row.status == null ? null : String(row.status);
      let status = normalizeStatus(statusRaw);
      const statusInferred = status == null;
      if (status == null) status = inferStatusFromText(description);

      const dueRaw = text(row.due_date);
      const [dueDate, approx] = parseDueDate(dueRaw, today);
      const waitingOn = text(row.waiting_on);
      const decisionPending = isDecisionPending(status, description);

      return makeCommitment({
        id: text(row.id),
        area,
        rawOwner: text(row.owner),
        owner: aliases.resolve(row.owner, area),
        description,
        dueDateRaw: dueRaw,
        dueDate,
        dueDateApprox: approx,
        statusRaw,
        status,
        statusInferred,
        lastUpdated: parseIsoDate(clean(row.last_updated)),
        waitingOn,
        blockedBy: text(row.blocked_by),
        decisionType: text(row.decision_type),
        decisionPending,
        principalBlocked: decisionPending && isBlockedOnPrincipal(description, waitingOn, boss),
        decision: text(row.decision),
        movesMetric: text(row.moves_metric),
        decidedOn: parseIsoDate(clean(row.decided_on)),
      });
    });
  const order = new Map(areaNames.map((n, i) => [n, i]));
  const rank = (c) => order.get(c.area) ?? areaNames.length;
  const indexed = out.map((c, i) => [c, i]);
  indexed.sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]);
  return { commitments: indexed.map(([c]) => c), unknownAreas: [...unknownAreas].sort() };
}
