"""Detection rules that need the whole dataset in view: staleness, overdue,
conflict, needs-a-deadline-set, dependency fan-out, and the customer-health
signal (data contract section 5). Decision-pending is detected per item at
load time, in engine/normalize.py.
"""
import re
from dataclasses import dataclass
from itertools import combinations
from typing import Optional

from engine.config import (
    STALE_THRESHOLD_DAYS,
    CONFLICT_WINDOW_DAYS,
    RATING_MISS_MARGIN,
    MIN_RATED_SAMPLE,
)


def all_commitments(units):
    return [c for unit in units.values() for c in unit.commitments]


def _key(text):
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def item_title(description):
    """The part of a description before its first comma. Units that keep
    status in the description (Wasla Table) change the tail every week, not
    the title: "Lease renewal, still waiting" becomes "Lease renewal, resolved".
    """
    return _key((description or "").split(",", 1)[0])


def item_key(commitment):
    """Identity of an item across weeks: its unit plus its title. Owner is left
    out so a reassigned item stays the same item. A renamed item does not: it
    shows as one item closing and a new one opening.
    """
    return (commitment.unit, item_title(commitment.description))


def _names(commitment):
    return {_key(commitment.description), item_title(commitment.description)}


def open_blocker(commitment, commitments):
    """The open tracked item this one is waiting on, if its blocked_by names
    one by title or full description. A free-text reason like "Central Legal
    review" matches nothing.
    """
    target = _key(commitment.blocked_by)
    if not target:
        return None
    for other in commitments:
        if other is not commitment and other.status != "done" and target in _names(other):
            return other
    return None


def blocked_items(commitment, commitments):
    """Open items whose blocked_by names this item."""
    names = _names(commitment)
    return [o for o in commitments
            if o is not commitment and o.status != "done" and _key(o.blocked_by) in names]


def is_stale(commitment, today, commitments):
    """Open item untouched for STALE_THRESHOLD_DAYS or more. Reads only
    last_updated, never the unit's status-update prose, so upbeat writing
    can't hide a stalled item.

    Two kinds of waiting are not staleness. An item waiting on another open
    tracked item is blocked: it shows up on its blocker's card, so the briefing
    points at the one root cause. A decision waiting on someone is measured by
    its own pending clock; calling it stale would blame the owner for a wait
    that isn't theirs.
    """
    if commitment.status == "done" or commitment.last_updated is None:
        return False
    if commitment.decision_pending:
        return False
    if open_blocker(commitment, commitments) is not None:
        return False
    return (today - commitment.last_updated).days >= STALE_THRESHOLD_DAYS


def is_overdue(commitment, today, commitments):
    """Open item past its due date. Added after week 2 of the sample data
    showed the gap: the stockout fix, 16 days late on a Flagship unit, was
    touched once and dropped out of the briefing, because touching it cleared
    the staleness flag and lateness alone flagged nothing. Blocked items are
    exempt for the same reason as staleness.
    """
    if commitment.status == "done" or commitment.due_date is None:
        return False
    if open_blocker(commitment, commitments) is not None:
        return False
    return commitment.due_date < today


def needs_deadline_set(commitment):
    """No usable due date: blank, or free text the engine can't read ("TBD").
    Flagged on its own, not scored as zero urgency and dropped. Decision-
    pending items are excluded: their urgency comes from how long they have
    waited, so they are scored on the grid.
    """
    return (commitment.status != "done"
            and commitment.due_date is None
            and not commitment.decision_pending)


@dataclass
class ConflictPair:
    owner: str
    a: object
    b: object
    days_apart: int


def find_conflicts(commitments):
    """Same normalized owner, both open, due dates within CONFLICT_WINDOW_DAYS.
    Alias resolution is what makes Priya Nair / P. Nair visible here, and
    what keeps Rahul Mehta and Raj Mehta apart.
    """
    by_owner = {}
    for c in commitments:
        if c.status != "done" and c.due_date is not None:
            by_owner.setdefault(c.owner, []).append(c)

    pairs = []
    for owner, items in by_owner.items():
        for a, b in combinations(items, 2):
            gap = abs((a.due_date - b.due_date).days)
            if gap <= CONFLICT_WINDOW_DAYS:
                pairs.append(ConflictPair(owner, a, b, gap))
    return pairs


@dataclass
class CustomerHealthResult:
    unit_name: str
    rating: Optional[float]
    target: Optional[float]
    count: Optional[float]
    miss: Optional[float]
    triggered: bool
    low_sample: bool
    reason: str


def evaluate_customer_health(units):
    """This week's rating vs the unit's own target, single week, behind a
    minimum-sample floor. A triggered unit lifts importance for its items
    (see engine/classify.py). Central has no customer metric and is skipped.
    """
    results = []
    for unit in units.values():
        cm = unit.customer_metric
        if cm is None:
            continue
        rating, target, count = cm["rating"], cm["target"], cm["count"]
        if rating is None or target is None or count is None:
            results.append(CustomerHealthResult(
                unit.name, rating, target, count, None, False, False,
                "rating, target or count missing this week"))
            continue
        miss = round(target - rating, 4)
        if count < MIN_RATED_SAMPLE:
            results.append(CustomerHealthResult(
                unit.name, rating, target, count, miss, False, True,
                f"only {count:.0f} rated this week, below the floor of {MIN_RATED_SAMPLE}"))
        elif miss > RATING_MISS_MARGIN:
            results.append(CustomerHealthResult(
                unit.name, rating, target, count, miss, True, False,
                f"{miss:.2f} below target, more than the {RATING_MISS_MARGIN} margin"))
        else:
            results.append(CustomerHealthResult(
                unit.name, rating, target, count, miss, False, False,
                f"within {RATING_MISS_MARGIN} of target"))
    return results
