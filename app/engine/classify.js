/* Importance x urgency classification, plus the effort sort inside the top
group (data contract section 5).

Importance is high if any of these hold:
  - the item's unit is Flagship tier
  - it is a decision blocked on the principal (the Group CEO)
  - it blocks FAN_OUT_THRESHOLD or more other open items
  - its unit missed its customer-rating target this week

Urgency is high if any of these hold:
  - it is overdue
  - it is due within DUE_SOON_DAYS
  - it is a decision that has been pending DECISION_PENDING_URGENT_DAYS or more

Tier counts only at the top: Core and Experimental score the same. The tier
still shows on every card as context.
*/
import {
  WASLA_TIERS,
  FAN_OUT_THRESHOLD,
  DECISION_PENDING_URGENT_DAYS,
  DUE_SOON_DAYS,
  DECISION_TYPE_EFFORT,
  EFFORT_ORDER,
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

/** tiers: { unit name: tier }. ratingMissedUnits: Set of unit names. */
export function classifyCommitment(commitment, today, blocks, ratingMissedUnits, tiers = WASLA_TIERS) {
  const c = commitment;
  const fanOut = blocks.length;

  const importanceReasons = [];
  if (tiers[c.unit] === "Flagship") importanceReasons.push(`${c.unit} is Flagship tier`);
  if (c.principalBlocked) importanceReasons.push("waiting on you (the principal) specifically");
  if (fanOut >= FAN_OUT_THRESHOLD) importanceReasons.push(`blocks ${fanOut} other open items`);
  if (ratingMissedUnits.has(c.unit)) importanceReasons.push(`${c.unit} missed its customer-rating target this week`);

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

  const effort = c.decisionPending ? (DECISION_TYPE_EFFORT[c.decisionType] ?? "Unknown") : null;

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
    flags: [],              // "decision-pending", "overdue", "stale", "conflict"
    conflictPartners: [],
  };
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inside the top group only: decision-pending items first, Low effort
before High, so a quick confirm/reject sits above anything that needs real
thought. Everything else, in every group, is ordered most overdue first. */
export function sortQuadrant(quadrant, items, today) {
  const byDue = (i) => (i.commitment.dueDate != null ? today - i.commitment.dueDate : -1e6);
  // Owner as tie-break keeps one person's same-day items side by side.
  const mostOverdueFirst = (x, y) => byDue(y) - byDue(x) || cmp(x.commitment.owner, y.commitment.owner);

  if (quadrant !== QUADRANT_NEEDS_DECISION_NOW) return [...items].sort(mostOverdueFirst);

  const effortRank = (i) => EFFORT_ORDER[i.effort] ?? 99;
  const decisions = items.filter((i) => i.commitment.decisionPending).sort((x, y) => effortRank(x) - effortRank(y));
  const others = items.filter((i) => !i.commitment.decisionPending).sort(mostOverdueFirst);
  return [...decisions, ...others];
}
