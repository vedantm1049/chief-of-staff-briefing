/* Importance x urgency classification, plus the effort sort inside the top
group (data contract section 5).

Importance is high if any of these hold:
  - the item's area is Flagship tier
  - it is a decision waiting on the principal (the boss named in setup)
  - it holds up FAN_OUT_THRESHOLD or more open items, counting the whole chain
  - it is linked to a metric its area missed this week (metrics.js)

Urgency is high if any of these hold:
  - it is overdue
  - it is due within DUE_SOON_DAYS
  - it is a decision that has been pending DECISION_PENDING_URGENT_DAYS or more

Only Flagship lifts importance. Inside each group, items are ordered by tier,
Flagship, then Core, then Experimental.
*/
import {
  FAN_OUT_THRESHOLD,
  DECISION_PENDING_URGENT_DAYS,
  DUE_SOON_DAYS,
  DECISION_TYPE_EFFORT,
  EFFORT_ORDER,
  TIER_ORDER,
} from "./config.js";

export const QUADRANT_NEEDS_DECISION_NOW = "Needs decision now";
export const QUADRANT_ON_YOUR_RADAR = "On your radar";
export const QUADRANT_FLAG_DONT_ESCALATE = "Flag, don't escalate";
export const QUADRANT_OMIT = "Omit";
export const QUADRANT_ORDER = [
  QUADRANT_NEEDS_DECISION_NOW,
  QUADRANT_ON_YOUR_RADAR,
  QUADRANT_FLAG_DONT_ESCALATE,
  QUADRANT_OMIT,
];

function days(n) {
  return n === 1 ? `${n} day` : `${n} days`;
}

/** tiers: { area name: tier }. missedMetrics: Map of area name to the metrics it
missed this week. */
/** blocks: the open items waiting on this one directly. chain: everything
further down behind them (rules.js: downstreamItems). */
export function classifyCommitment(commitment, today, blocks, missedMetrics, tiers = {}, chain = []) {
  const c = commitment;
  const fanOut = blocks.length + chain.length;

  const importanceReasons = [];
  if (tiers[c.area] === "Flagship") importanceReasons.push(`${c.area} is Flagship tier`);
  if (c.principalBlocked) importanceReasons.push("waiting on you (the principal) specifically");
  if (fanOut >= FAN_OUT_THRESHOLD) {
    importanceReasons.push(chain.length
      ? `holds up ${fanOut} open items, ${blocks.length} directly and ${chain.length} down the chain`
      : `blocks ${fanOut} other open items`);
  }
  // A miss lifts only the tasks meant to move that metric, not the whole area.
  const missed = missedMetrics.get?.(c.area) ?? [];
  const linked = c.movesMetric && missed.find((m) => m.toLowerCase() === c.movesMetric.toLowerCase());
  if (linked) importanceReasons.push(`${c.area} missed its ${linked} target this week, which this task is meant to move`);

  const urgencyReasons = [];
  if (c.dueDate != null) {
    const gap = c.dueDate - today;
    if (gap < 0) urgencyReasons.push(`overdue by ${days(-gap)}`);
    else if (gap <= DUE_SOON_DAYS) urgencyReasons.push(gap === 0 ? "due today" : `due in ${days(gap)}`);
  }
  if (c.decisionPending && c.lastUpdated != null) {
    const waited = today - c.lastUpdated;
    if (waited >= DECISION_PENDING_URGENT_DAYS) urgencyReasons.push(`decision pending for ${days(waited)}`);
  }

  const importance = importanceReasons.length > 0;
  const urgency = urgencyReasons.length > 0;
  const quadrant = importance && urgency ? QUADRANT_NEEDS_DECISION_NOW
    : importance ? QUADRANT_ON_YOUR_RADAR
    : urgency ? QUADRANT_FLAG_DONT_ESCALATE
    : QUADRANT_OMIT;

  const effort = c.decisionPending ? (DECISION_TYPE_EFFORT[c.decisionType.trim().toLowerCase()] ?? "Unknown") : null;

  return {
    commitment: c,
    importance,
    importanceReasons,
    urgency,
    urgencyReasons,
    quadrant,
    effort,
    fanOut,
    blocks,
    chain,
    flags: [],              // "decision-pending", "overdue", "stale", "conflict"
    conflictPartners: [],
  };
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inside the top group only: decision-pending items first, Low effort
before High, so a quick confirm/reject sits above anything that needs real
thought. Everything else, in every group, is ordered by tier (Flagship,
Core, Experimental), then most overdue first. */
export function sortQuadrant(quadrant, items, today, tiers = {}) {
  const tierRank = (i) => TIER_ORDER[tiers[i.commitment.area]] ?? 99;
  const byDue = (i) => (i.commitment.dueDate != null ? today - i.commitment.dueDate : -1e6);
  // Owner as the last tie-break keeps one person's same-day items side by side.
  const byTierThenOverdue = (x, y) => tierRank(x) - tierRank(y) || byDue(y) - byDue(x)
    || cmp(x.commitment.owner, y.commitment.owner);

  if (quadrant !== QUADRANT_NEEDS_DECISION_NOW) return [...items].sort(byTierThenOverdue);

  const effortRank = (i) => EFFORT_ORDER[i.effort] ?? 99;
  const decisions = items.filter((i) => i.commitment.decisionPending)
    .sort((x, y) => effortRank(x) - effortRank(y) || tierRank(x) - tierRank(y));
  const others = items.filter((i) => !i.commitment.decisionPending).sort(byTierThenOverdue);
  return [...decisions, ...others];
}
