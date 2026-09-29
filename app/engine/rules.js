/* Detection rules that need the whole dataset in view: staleness, overdue,
conflict, needs-a-deadline-set, dependency fan-out, and the customer-health
signal (data contract section 5). Decision pending is detected per item at
load time, in normalize.js.
*/
import {
  STALE_THRESHOLD_DAYS,
  CONFLICT_WINDOW_DAYS,
  RATING_MISS_MARGIN,
  MIN_RATED_SAMPLE,
} from "./config.js";

function key(text) {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** The part of a task before its first comma. People change the tail every
week, not the title: "Lease renewal, still waiting" becomes "Lease renewal,
resolved". */
export function itemTitle(description) {
  return key((description ?? "").split(",", 1)[0]);
}

/** Identity of an item across weeks: its area plus its title. Owner is left
out so a reassigned item stays the same item. A renamed item does not: it
shows as one item closing and a new one opening. */
export function itemKey(commitment) {
  return `${commitment.area}\u0000${itemTitle(commitment.description)}`;
}

function names(commitment) {
  return new Set([key(commitment.description), itemTitle(commitment.description)]);
}

/** The open tracked item this one is waiting on, if its blockedBy names one
by title or full description. A free-text reason like "Central Legal review"
matches nothing. */
export function openBlocker(commitment, commitments) {
  const target = key(commitment.blockedBy);
  if (!target) return null;
  for (const other of commitments) {
    if (other !== commitment && other.status !== "done" && names(other).has(target)) return other;
  }
  return null;
}

/** Open items whose blockedBy names this item. */
export function blockedItems(commitment, commitments) {
  const own = names(commitment);
  return commitments.filter((o) => o !== commitment && o.status !== "done" && own.has(key(o.blockedBy)));
}

/** Open item untouched for STALE_THRESHOLD_DAYS or more. Reads only
lastUpdated, never how the task is worded, so upbeat writing ("huge
momentum") can't hide a stalled item.

Two kinds of waiting are not staleness. An item waiting on another open
tracked item is blocked: it shows up on its blocker's card, so the briefing
points at the one root cause. A decision waiting on someone is measured by
its own pending clock; calling it stale would blame the owner for a wait
that isn't theirs. */
export function isStale(commitment, today, commitments) {
  if (commitment.status === "done" || commitment.lastUpdated == null) return false;
  if (commitment.decisionPending) return false;
  if (openBlocker(commitment, commitments) != null) return false;
  return today - commitment.lastUpdated >= STALE_THRESHOLD_DAYS;
}

/** Open item past its due date. Added after week 2 of the sample data
showed the gap: the stockout fix, 16 days late in a Flagship area, was
touched once and dropped out of the briefing, because touching it cleared
the staleness flag and lateness alone flagged nothing. Blocked items are
exempt for the same reason as staleness. */
export function isOverdue(commitment, today, commitments) {
  if (commitment.status === "done" || commitment.dueDate == null) return false;
  if (openBlocker(commitment, commitments) != null) return false;
  return commitment.dueDate < today;
}

/** No usable due date: blank, or free text the engine can't read ("TBD").
Flagged on its own, not scored as zero urgency and dropped. Decision-pending
items are excluded: their urgency comes from how long they have waited, so
they are scored on the grid. */
export function needsDeadlineSet(commitment) {
  return commitment.status !== "done" && commitment.dueDate == null && !commitment.decisionPending;
}

/** Same normalized owner, both open, due dates within CONFLICT_WINDOW_DAYS.
Alias resolution is what makes Priya Nair / P. Nair visible here, and what
keeps Rahul Mehta and Raj Mehta apart. Returns [{ owner, a, b, daysApart }]. */
export function findConflicts(commitments) {
  const byOwner = new Map();
  for (const c of commitments) {
    if (c.status !== "done" && c.dueDate != null) {
      if (!byOwner.has(c.owner)) byOwner.set(c.owner, []);
      byOwner.get(c.owner).push(c);
    }
  }
  const pairs = [];
  for (const [owner, items] of byOwner) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const gap = Math.abs(items[i].dueDate - items[j].dueDate);
        if (gap <= CONFLICT_WINDOW_DAYS) pairs.push({ owner, a: items[i], b: items[j], daysApart: gap });
      }
    }
  }
  return pairs;
}

/** This week's rating vs the area's own target, single week, behind a
minimum-sample floor. A triggered area lifts importance for its items (see
classify.js). ratings: from loaders.js loadRatings. */
export function evaluateCustomerHealth(ratings) {
  return ratings.map(({ area, rating, target, count, segments }) => {
    const base = { area, rating, target, count, segments };
    if (rating == null || target == null || count == null) {
      return { ...base, miss: null, triggered: false, lowSample: false,
        reason: "rating, target or count missing this week" };
    }
    const miss = Math.round((target - rating) * 10000) / 10000;
    if (count < MIN_RATED_SAMPLE) {
      return { ...base, miss, triggered: false, lowSample: true,
        reason: `only ${count.toFixed(0)} rated this week, below the floor of ${MIN_RATED_SAMPLE}` };
    }
    if (miss > RATING_MISS_MARGIN) {
      return { ...base, miss, triggered: true, lowSample: false,
        reason: `${miss.toFixed(2)} below target, more than the ${RATING_MISS_MARGIN} margin` };
    }
    return { ...base, miss, triggered: false, lowSample: false, reason: `within ${RATING_MISS_MARGIN} of target` };
  });
}
