/* Per-unit loaders. Each unit ships its weekly inputs in a different shape
(data contract section 3). This module absorbs that into one common record.
It reads and normalizes. It scores nothing.

A unit's files come in as { file name: contents }: text for CSV and .txt,
bytes (Uint8Array or ArrayBuffer) for Excel. Where they came from, a fetch
or a file on disk, is not this module's business.
*/
import {
  normalizeStatus,
  inferStatusFromText,
  isDecisionPending,
  isBlockedOnPrincipal,
  parseDueDate,
} from "./normalize.js";
import { csvRecords, readWorkbook } from "./parse.js";
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
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isNaN(n) ? null : n;
}

function toBool(v) {
  v = clean(v);
  if (v == null) return null;
  return ["true", "1", "yes"].includes(String(v).trim().toLowerCase());
}

/** One tracked item, read from one row of a unit's commitments file. */
export function makeCommitment(fields) {
  return {
    unit: "",               // unit whose file lists the item, e.g. "Wasla Table"
    rawOwner: "",
    owner: "",              // after alias resolution
    description: "",
    dueDateRaw: "",
    dueDate: null,
    dueDateApprox: false,   // parsed from free text
    statusRaw: null,
    status: "open",         // "open" | "done" | "pending_decision"
    statusInferred: false,  // read from the description, not a status column
    lastUpdated: null,
    blockedBy: "",
    decisionType: "",
    regulatoryDeadline: null,
    decisionPending: false,
    principalBlocked: false,
    ...fields,
  };
}

function loadCommitments(text, unitName, aliases, today) {
  const { fields, rows } = csvRecords(text);
  const hasStatusColumn = fields.includes("status");
  return rows.map((row) => {
    const description = (row.description ?? "").trim();

    const statusRaw = hasStatusColumn ? (row.status ?? null) : null;
    let status = normalizeStatus(statusRaw);
    const statusInferred = status == null;
    if (status == null) status = inferStatusFromText(description);

    const dueRaw = (row.due_date ?? "").trim();
    const [dueDate, approx] = parseDueDate(dueRaw, today);
    const blockedBy = (row.blocked_by ?? "").trim();
    const decisionPending = isDecisionPending(status, description);

    return makeCommitment({
      unit: unitName,
      rawOwner: (row.owner ?? "").trim(),
      owner: aliases.resolve(row.owner, unitName),
      description,
      dueDateRaw: dueRaw,
      dueDate,
      dueDateApprox: approx,
      statusRaw,
      status,
      statusInferred,
      lastUpdated: parseIsoDate(clean(row.last_updated)),
      blockedBy,
      decisionType: (row.decision_type ?? "").trim(),
      regulatoryDeadline: toBool(row.regulatory_deadline),
      decisionPending,
      principalBlocked: decisionPending && isBlockedOnPrincipal(description, blockedBy),
    });
  });
}

/** First row of a KPI export. Numbers become numbers, blanks become null,
anything else stays text. A column that is absent is simply not there. */
function kpiRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    const n = toFloat(v);
    out[k] = n != null ? n : clean(v);
  }
  return out;
}

/** Rating vs target for customer-facing units. Mart's three city tabs are
blended, weighted by each tab's rated-order count. Central has none. */
function customerMetric(unit, metricColumns) {
  if (!metricColumns) return null;
  const [ratingCol, targetCol, countCol] = metricColumns;

  if (unit.kpiBreakdown == null) {
    return {
      rating: toFloat(unit.kpi[ratingCol]),
      target: toFloat(unit.kpi[targetCol]),
      count: toFloat(unit.kpi[countCol]),
      perTab: null,
    };
  }

  let total = 0, ratingSum = 0, targetSum = 0;
  const perTab = {};
  for (const [tab, row] of Object.entries(unit.kpiBreakdown)) {
    const rating = toFloat(row[ratingCol]);
    const target = toFloat(row[targetCol]);
    const count = toFloat(row[countCol]);
    perTab[tab] = { rating, target, count };
    if (rating == null || target == null || !count) continue;
    total += count;
    ratingSum += rating * count;
    targetSum += target * count;
  }
  return {
    rating: total ? ratingSum / total : null,
    target: total ? targetSum / total : null,
    count: total || null,
    perTab,
  };
}

/** spec: { key, name, metric } from the setup. files: { file name: contents }. */
export function loadUnit(spec, files, aliases, today) {
  let kpi = {}, kpiBreakdown = null;
  if (files["kpi_export.xlsx"] != null) {
    const sheets = readWorkbook(files["kpi_export.xlsx"]);
    kpiBreakdown = {};
    for (const [tab, rows] of Object.entries(sheets)) kpiBreakdown[tab] = kpiRow(rows[0]);
  } else if (files["kpi_export.csv"] != null) {
    kpi = kpiRow(csvRecords(files["kpi_export.csv"]).rows[0]);
  }

  const unit = {
    key: spec.key,
    name: spec.name,
    kpi,                    // this week's KPI row (empty for Mart, see kpiBreakdown)
    kpiBreakdown,           // Mart only: { tab name: row }
    statusUpdate: (files["status_update.txt"] ?? "").trim(),   // loaded for reference, never scored
    commitments: loadCommitments(files["commitments.csv"] ?? "", spec.name, aliases, today),
    customerMetric: null,
  };
  unit.customerMetric = customerMetric(unit, spec.metric);
  return unit;
}

/** Most common week_ending across the KPI exports that carry one. */
export function detectWeekEnding(units) {
  const counts = new Map();
  for (const u of Object.values(units)) {
    const w = u.kpi.week_ending;
    if (w) counts.set(String(w), (counts.get(String(w)) ?? 0) + 1);
  }
  let best = null;
  for (const [w, n] of counts) if (best == null || n > counts.get(best)) best = w;
  return best == null ? null : parseIsoDate(best);
}
