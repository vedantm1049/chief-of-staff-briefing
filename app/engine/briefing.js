/* Wires load, normalize, detect and classify into one briefing for a single
week. history.js compares several of these week to week.
*/
import { WASLA_UNITS } from "./config.js";
import { AliasTable } from "./normalize.js";
import { loadUnit, detectWeekEnding } from "./loaders.js";
import {
  allCommitments,
  isStale,
  isOverdue,
  needsDeadlineSet,
  findConflicts,
  blockedItems,
  evaluateCustomerHealth,
} from "./rules.js";
import { classifyCommitment, sortQuadrant, QUADRANT_ORDER } from "./classify.js";
import { parseIsoDate } from "./dates.js";

/** Everything this week's briefing surfaces: graded items plus the ones that
need a deadline. */
export function flaggedCommitments(b) {
  return [...[...b.classified.values()].map((i) => i.commitment), ...b.needsDeadlineItems];
}

/** Score one week.

week: { weekEnding: "YYYY-MM-DD" or null, files: { unit key: { file name: contents } } }
options.aliasText: the alias table CSV.
options.today: a day number. Defaults to the day after weekEnding, the Monday
  the briefing is read.
options.units: the unit setup, defaults to the six Wasla units. */
export function buildBriefing(week, { aliasText, today = null, units: specs = WASLA_UNITS } = {}) {
  const aliases = AliasTable.fromCsv(aliasText ?? "");
  const folderDate = parseIsoDate(week.weekEnding);
  if (today == null) {
    if (folderDate == null) throw new Error("A week needs a week-ending date or an explicit today.");
    today = folderDate + 1;   // the Monday after
  }

  const units = {};
  for (const spec of specs) units[spec.key] = loadUnit(spec, week.files[spec.key] ?? {}, aliases, today);
  const tiers = Object.fromEntries(specs.map((s) => [s.name, s.tier]));
  const commitments = allCommitments(units);

  const stale = new Set(commitments.filter((c) => isStale(c, today, commitments)));
  const overdue = new Set(commitments.filter((c) => isOverdue(c, today, commitments)));
  const blocksMap = new Map(commitments.map((c) => [c, blockedItems(c, commitments)]));

  const conflicts = findConflicts(commitments);
  const partners = new Map();
  for (const pair of conflicts) {
    if (!partners.has(pair.a)) partners.set(pair.a, []);
    if (!partners.has(pair.b)) partners.set(pair.b, []);
    partners.get(pair.a).push(pair.b);
    partners.get(pair.b).push(pair.a);
  }

  const needsDeadlineItems = commitments.filter(needsDeadlineSet);
  const needsDeadline = new Set(needsDeadlineItems);

  const customerHealth = evaluateCustomerHealth(units);
  const ratingMissed = new Set(customerHealth.filter((r) => r.triggered).map((r) => r.unitName));

  const classified = new Map();
  const quadrants = Object.fromEntries(QUADRANT_ORDER.map((q) => [q, []]));
  for (const c of commitments) {
    const flags = [];
    if (c.decisionPending) flags.push("decision-pending");
    if (overdue.has(c)) flags.push("overdue");
    if (stale.has(c)) flags.push("stale");
    if (partners.has(c)) flags.push("conflict");
    if (!flags.length || needsDeadline.has(c)) continue;
    const item = classifyCommitment(c, today, blocksMap.get(c), ratingMissed, tiers);
    item.flags = flags;
    item.conflictPartners = partners.get(c) ?? [];
    classified.set(c, item);
    quadrants[item.quadrant].push(item);
  }
  for (const q of QUADRANT_ORDER) quadrants[q] = sortQuadrant(q, quadrants[q], today);

  return {
    today,
    weekEnding: folderDate ?? detectWeekEnding(units),
    units,
    allCommitments: commitments,
    conflicts,
    conflictPartnerMap: partners,   // commitment -> [partner commitments]
    stale,                          // Set of commitments
    overdue,                        // Set of commitments
    blocksMap,                      // commitment -> [open items it blocks]
    needsDeadlineItems,
    classified,                     // commitment -> classified item
    quadrants,                      // group name -> [classified item], sorted
    customerHealth,
    unresolvedOwners: aliases.unresolved,   // [[raw name, unit]] not in the alias table
    comparison: null,               // set by history.js
  };
}
