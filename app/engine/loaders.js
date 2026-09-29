/* Reads template rows into one common record per task, and one rating per
area. It reads and normalizes. It scores nothing.

The template (docs/data_contract.md section 3):
  tasks:   area, task, owner, due_date, status, waiting_on, blocked_by,
           decision_type, last_updated
  metrics: area, metric, segment, value, target, count

Rows come in as objects keyed by those column names, from the sample files,
an uploaded template, or a file whose columns the reader matched on the page.
*/
import {
  normalizeStatus,
  inferStatusFromText,
  isDecisionPending,
  isBlockedOnPrincipal,
  parseDueDate,
} from "./normalize.js";
import { parseIsoDate } from "./dates.js";
import { RATING_METRIC } from "./config.js";

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
      });
    });
  const order = new Map(areaNames.map((n, i) => [n, i]));
  const rank = (c) => order.get(c.area) ?? areaNames.length;
  const indexed = out.map((c, i) => [c, i]);
  indexed.sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]);
  return { commitments: indexed.map(([c]) => c), unknownAreas: [...unknownAreas].sort() };
}

/** Customer rating per area, from the metrics rows. Several rows for one
area (cities, stores) are blended, weighted by each row's count. Areas with
no rating row are left out: not every area has customers. */
export function loadRatings(rows, { areaNames }) {
  const match = areaMatcher(areaNames);
  const byArea = new Map();
  for (const row of rows) {
    if (text(row.metric).toLowerCase() !== RATING_METRIC) continue;
    const area = match(row.area) ?? text(row.area);
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push({
      segment: text(row.segment),
      rating: toFloat(row.value),
      target: toFloat(row.target),
      count: toFloat(row.count),
    });
  }
  const order = new Map(areaNames.map((n, i) => [n, i]));
  const areas = [...byArea.keys()].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  return areas.map((area) => {
    const segments = byArea.get(area);
    let total = 0, ratingSum = 0, targetSum = 0;
    for (const s of segments) {
      if (s.rating == null || s.target == null || !s.count) continue;
      total += s.count;
      ratingSum += s.rating * s.count;
      targetSum += s.target * s.count;
    }
    return {
      area,
      rating: total ? ratingSum / total : null,
      target: total ? targetSum / total : null,
      count: total || null,
      segments: segments.length > 1 || segments[0].segment ? segments : null,
    };
  });
}
