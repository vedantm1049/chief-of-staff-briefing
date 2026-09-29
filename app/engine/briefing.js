/* Wires load, normalize, detect and classify into one briefing for a single
week. history.js compares several of these week to week.
*/
import { WASLA_SETUP } from "./config.js";
import { AliasTable } from "./normalize.js";
import { loadTasks, loadRatings } from "./loaders.js";
import {
  itemKey,
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

week: { weekEnding: "YYYY-MM-DD", tasks: [row], metrics: [row] }, rows in
  the template's columns (loaders.js).
options.setup: { boss, areas: [{ name, tier }] }. Defaults to the Wasla sample.
options.aliasText: the owner table as CSV, or options.aliases: its rows.
options.today: a day number. Defaults to the day after weekEnding, the Monday
  the briefing is read.
options.edits: the reader's own changes for this week, see applyEdits. */
export function buildBriefing(week, { setup = WASLA_SETUP, aliasText, aliases: aliasRows, today = null, edits = [] } = {}) {
  const aliases = aliasRows ? new AliasTable(aliasRows) : AliasTable.fromCsv(aliasText ?? "");
  const weekEnding = parseIsoDate(week.weekEnding);
  if (today == null) {
    if (weekEnding == null) throw new Error("A week needs a week-ending date or an explicit today.");
    today = weekEnding + 1;   // the Monday after
  }

  const areaNames = setup.areas.map((a) => a.name);
  const tiers = Object.fromEntries(setup.areas.map((a) => [a.name, a.tier]));
  const { commitments, unknownAreas } = loadTasks(week.tasks ?? [], { areaNames, aliases, today, boss: setup.boss });
  applyEdits(commitments, edits);

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

  const customerHealth = evaluateCustomerHealth(loadRatings(week.metrics ?? [], { areaNames }));
  const ratingMissed = new Set(customerHealth.filter((r) => r.triggered).map((r) => r.area));

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
    customerHealth,
    unresolvedOwners: aliases.unresolved,   // [[raw name, area]] not in the owner table
    unknownAreas,                           // area names in the files but not in the setup
    ownerEmails: aliases.emails,            // canonical owner -> email
    comparison: null,               // set by history.js
  };
}

/** The reader's own changes, made on the page: an item ticked done, or a due
date changed. Each edit is { area, title, done, due } where title is the
item's title (rules.js: itemTitle) and due is "YYYY-MM-DD". An edit belongs
to one week only. Next week's files from the teams replace it: new data
wins. The item keeps a note of what was changed, so the page can say so. */
export function applyEdits(commitments, edits) {
  if (!edits.length) return;
  const byKey = new Map(edits.map((e) => [`${e.area}\u0000${e.title}`, e]));
  for (const c of commitments) {
    const e = byKey.get(itemKey(c));
    if (!e) continue;
    c.edited = { done: false, dueFrom: null };
    if (e.due != null && parseIsoDate(e.due) != null) {
      c.edited.dueFrom = c.dueDateRaw;
      c.dueDate = parseIsoDate(e.due);
      c.dueDateRaw = e.due;
      c.dueDateApprox = false;
    }
    if (e.done) {
      c.edited.done = true;
      c.status = "done";
      c.statusInferred = false;
      c.decisionPending = false;
      c.principalBlocked = false;
    }
  }
}
