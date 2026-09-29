/* Wires load, normalize, detect and classify into one briefing for a single
week. history.js compares several of these week to week.
*/
import { AliasTable } from "./normalize.js";
import { loadTasks } from "./loaders.js";
import { evaluateMetrics } from "./metrics.js";
import {
  isStale,
  isOverdue,
  needsDeadlineSet,
  findConflicts,
  blockedItems,
} from "./rules.js";
import { classifyCommitment, sortQuadrant, QUADRANT_ORDER } from "./classify.js";
import { parseIsoDate } from "./dates.js";

/** Everything this week's briefing surfaces: graded items plus the ones that
need a deadline. */
export function flaggedCommitments(b) {
  return [...[...b.classified.values()].map((i) => i.commitment), ...b.needsDeadlineItems];
}

/** Score one week.

week: { weekEnding: "YYYY-MM-DD", tasks: [row], metrics: [row] }, rows in
  the columns of docs/data_contract.md section 3.
options.setup: { boss, areas: [{ name, tier, leader, metrics }] }.
options.aliasText: the owner table as CSV, or options.aliases: its rows.
options.today: a day number. Defaults to the day after weekEnding, the Monday
  the briefing is read. */
export function buildBriefing(week, { setup, aliasText, aliases: aliasRows, today = null } = {}) {
  const aliases = aliasRows ? new AliasTable(aliasRows) : AliasTable.fromCsv(aliasText ?? "");
  const weekEnding = parseIsoDate(week.weekEnding);
  if (today == null) {
    if (weekEnding == null) throw new Error("A week needs a week-ending date or an explicit today.");
    today = weekEnding + 1;   // the Monday after
  }

  const areaNames = setup.areas.map((a) => a.name);
  const tiers = Object.fromEntries(setup.areas.map((a) => [a.name, a.tier]));
  const { commitments, unknownAreas } = loadTasks(week.tasks ?? [], { areaNames, aliases, today, boss: setup.boss });

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

  const metricResults = evaluateMetrics(setup.areas, week.metrics ?? []);
  const missedMetrics = new Map();
  for (const r of metricResults.filter((x) => x.triggered)) {
    if (!missedMetrics.has(r.area)) missedMetrics.set(r.area, []);
    missedMetrics.get(r.area).push(r.metric);
  }

  const classified = new Map();
  const quadrants = Object.fromEntries(QUADRANT_ORDER.map((q) => [q, []]));
  for (const c of commitments) {
    const flags = [];
    if (c.decisionPending) flags.push("decision-pending");
    if (overdue.has(c)) flags.push("overdue");
    if (stale.has(c)) flags.push("stale");
    if (partners.has(c)) flags.push("conflict");
    if (!flags.length || needsDeadline.has(c)) continue;
    const item = classifyCommitment(c, today, blocksMap.get(c), missedMetrics, tiers);
    item.flags = flags;
    item.conflictPartners = partners.get(c) ?? [];
    classified.set(c, item);
    quadrants[item.quadrant].push(item);
  }
  for (const q of QUADRANT_ORDER) quadrants[q] = sortQuadrant(q, quadrants[q], today, tiers);

  return {
    today,
    weekEnding,
    setup,
    tiers,
    allCommitments: commitments,
    conflicts,
    conflictPartnerMap: partners,   // commitment -> [partner commitments]
    stale,                          // Set of commitments
    overdue,                        // Set of commitments
    blocksMap,                      // commitment -> [open items it blocks]
    needsDeadlineItems,
    classified,                     // commitment -> classified item
    quadrants,                      // group name -> [classified item], sorted
    metricResults,                  // one per tracked metric, see metrics.js
    unresolvedOwners: aliases.unresolved,   // [[raw name, area]] not in the owner table
    unknownAreas,                           // area names in the files but not in the setup
    ownerEmails: aliases.emails,            // canonical owner -> email
    comparison: null,               // set by history.js
  };
}
