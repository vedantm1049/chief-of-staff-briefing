/* The metrics each area reports every week, against the targets the Chief
of Staff set for them. One rule for every metric: a miss is when the value
is worse than target by more than the metric's margin, in the direction the
metric counts as good. A miss raises the priority of that area's items.

A metric definition, from setup:
  { name, unit, target, better: "higher" | "lower",
    margin, marginKind: "percent" | "points", minCount }
minCount, when set, is a floor on how many responses a number rests on (a
customer rating from 6 reviews is noise). The weekly value then needs a count.

Weekly values arrive as rows: { area, metric, segment, value, target, count }.
A row's target, when given, is used over the definition's.
*/
import { areaMatcher, toFloat } from "./loaders.js";

const text = (v) => (v == null ? "" : String(v).trim());
const key = (s) => text(s).toLowerCase().replace(/\s+/g, " ");
const round = (n) => Math.round(n * 10000) / 10000;

export function marginText(def) {
  if (def.marginKind !== "points") return `${def.margin}%`;
  return def.unit === "%" ? `${def.margin} points` : `${def.margin}`;
}

/** Several rows for one metric (cities, stores): averaged by count when every
row has one, otherwise added up. */
function combine(rows) {
  const parsed = rows.map((r) => ({
    segment: text(r.segment), value: toFloat(r.value), target: toFloat(r.target), count: toFloat(r.count),
  }));
  const usable = parsed.filter((r) => r.value != null);
  if (!usable.length) return { value: null, target: null, count: null, segments: null };
  const segments = parsed.length > 1 || parsed[0].segment ? parsed : null;
  if (usable.length === 1) return { ...usable[0], segments };
  if (usable.every((r) => r.count)) {
    const total = usable.reduce((s, r) => s + r.count, 0);
    const avg = (f) => (usable.every((r) => r[f] != null) ? usable.reduce((s, r) => s + r[f] * r.count, 0) / total : null);
    return { value: avg("value"), target: avg("target"), count: total, segments };
  }
  const sum = (f) => (usable.every((r) => r[f] != null) ? usable.reduce((s, r) => s + r[f], 0) : null);
  return { value: sum("value"), target: sum("target"), count: sum("count"), segments };
}

/** One result per metric the setup tracks, area by area in setup order. */
export function evaluateMetrics(areas, rows) {
  const match = areaMatcher(areas.map((a) => a.name));
  const byKey = new Map();
  for (const row of rows) {
    const area = match(row.area);
    if (!area) continue;
    const k = `${area}\u0000${key(row.metric)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(row);
  }
  const results = [];
  for (const area of areas) {
    for (const def of area.metrics ?? []) {
      const rowsFor = byKey.get(`${area.name}\u0000${key(def.name)}`) ?? [];
      const { value, target: rowTarget, count, segments } = rowsFor.length ? combine(rowsFor) : {};
      const target = rowTarget ?? toFloat(def.target);
      const base = { area: area.name, metric: def.name, unit: def.unit ?? "", better: def.better, def,
        value: value ?? null, target, count: count ?? null, segments: segments ?? null };
      if (value == null) {
        results.push({ ...base, reported: false, shortfall: null, triggered: false, lowSample: false,
          reason: rowsFor.length ? "no number given this week" : "not reported this week" });
        continue;
      }
      if (target == null) {
        results.push({ ...base, reported: true, shortfall: null, triggered: false, lowSample: false, reason: "no target set" });
        continue;
      }
      const shortfall = round(def.better === "lower" ? value - target : target - value);
      const threshold = round(def.marginKind === "points" ? def.margin : Math.abs(target) * def.margin / 100);
      const direction = def.better === "lower" ? "above" : "below";
      if (def.minCount && (count == null || count < def.minCount)) {
        results.push({ ...base, reported: true, shortfall, triggered: false, lowSample: true,
          reason: count == null ? "no count given, so it can't be judged"
            : `only ${count.toFixed(0)} counted this week, below the floor of ${def.minCount}` });
      } else if (shortfall > threshold) {
        const by = def.marginKind === "points" ? shortfall.toFixed(2) : `${((shortfall / Math.abs(target || 1)) * 100).toFixed(1)}%`;
        results.push({ ...base, reported: true, shortfall, triggered: true, lowSample: false,
          reason: `${by} ${direction} target, more than the ${marginText(def)} margin` });
      } else {
        results.push({ ...base, reported: true, shortfall, triggered: false, lowSample: false,
          reason: shortfall <= 0 ? "on or better than target" : `within ${marginText(def)} of target` });
      }
    }
  }
  return results;
}
