"""Importance x urgency classification, plus the effort sort inside the top
quadrant (data contract section 5).

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
"""
from dataclasses import dataclass, field
from typing import Optional

from engine.config import (
    UNIT_TIERS,
    FAN_OUT_THRESHOLD,
    DECISION_PENDING_URGENT_DAYS,
    DUE_SOON_DAYS,
    DECISION_TYPE_EFFORT,
    EFFORT_ORDER,
)

QUADRANT_NEEDS_DECISION_NOW = "Needs decision now"
QUADRANT_ON_YOUR_RADAR = "On your radar"
QUADRANT_FLAG_DONT_ESCALATE = "Flag, don't escalate"
QUADRANT_OMIT = "Omit"
QUADRANT_ORDER = [
    QUADRANT_NEEDS_DECISION_NOW,
    QUADRANT_ON_YOUR_RADAR,
    QUADRANT_FLAG_DONT_ESCALATE,
    QUADRANT_OMIT,
]


def _days(n):
    return f"{n} day" if n == 1 else f"{n} days"


@dataclass
class ClassifiedItem:
    commitment: object
    importance: bool
    importance_reasons: list
    urgency: bool
    urgency_reasons: list
    quadrant: str
    effort: Optional[str]
    fan_out: int
    blocks: list = field(default_factory=list)
    flags: list = field(default_factory=list)          # "stale", "conflict", "decision-pending"
    conflict_partners: list = field(default_factory=list)


def classify_commitment(commitment, today, blocks, rating_missed_units):
    c = commitment
    fan_out = len(blocks)

    importance_reasons = []
    if UNIT_TIERS.get(c.unit) == "Flagship":
        importance_reasons.append(f"{c.unit} is Flagship tier")
    if c.principal_blocked:
        importance_reasons.append("waiting on you (the principal) specifically")
    if fan_out >= FAN_OUT_THRESHOLD:
        importance_reasons.append(f"blocks {fan_out} other open items")
    if c.unit in rating_missed_units:
        importance_reasons.append(f"{c.unit} missed its customer-rating target this week")

    urgency_reasons = []
    if c.due_date is not None:
        gap = (c.due_date - today).days
        if gap < 0:
            urgency_reasons.append(f"overdue by {_days(-gap)}")
        elif gap <= DUE_SOON_DAYS:
            urgency_reasons.append("due today" if gap == 0 else f"due in {_days(gap)}")
    if c.decision_pending and c.last_updated is not None:
        waited = (today - c.last_updated).days
        if waited >= DECISION_PENDING_URGENT_DAYS:
            urgency_reasons.append(f"decision pending for {_days(waited)}")

    importance, urgency = bool(importance_reasons), bool(urgency_reasons)
    if importance and urgency:
        quadrant = QUADRANT_NEEDS_DECISION_NOW
    elif importance:
        quadrant = QUADRANT_ON_YOUR_RADAR
    elif urgency:
        quadrant = QUADRANT_FLAG_DONT_ESCALATE
    else:
        quadrant = QUADRANT_OMIT

    effort = DECISION_TYPE_EFFORT.get(c.decision_type, "Unknown") if c.decision_pending else None

    return ClassifiedItem(
        commitment=c,
        importance=importance,
        importance_reasons=importance_reasons,
        urgency=urgency,
        urgency_reasons=urgency_reasons,
        quadrant=quadrant,
        effort=effort,
        fan_out=fan_out,
        blocks=blocks,
    )


def sort_quadrant(quadrant, items, today):
    """Inside the top quadrant only: decision-pending items first, Low effort
    before High, so a quick confirm/reject sits above anything that needs real
    thought. Everything else, in every quadrant, is ordered most overdue first.
    """
    def by_due(i):
        due = i.commitment.due_date
        return (today - due).days if due else -10**6

    def most_overdue_first(i):
        # Owner as tie-break keeps one person's same-day items side by side.
        return (-by_due(i), i.commitment.owner)

    if quadrant != QUADRANT_NEEDS_DECISION_NOW:
        return sorted(items, key=most_overdue_first)

    decisions = sorted((i for i in items if i.commitment.decision_pending),
                       key=lambda i: EFFORT_ORDER.get(i.effort, 99))
    others = sorted((i for i in items if not i.commitment.decision_pending),
                    key=most_overdue_first)
    return decisions + others
