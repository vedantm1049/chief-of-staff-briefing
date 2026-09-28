"""Edge cases the shipped snapshot doesn't contain but the data contract says
the engine must handle.
"""
from datetime import date, timedelta

import pytest

from engine.classify import classify_commitment, QUADRANT_NEEDS_DECISION_NOW
from engine.loaders import Commitment
from engine.normalize import (
    normalize_status,
    infer_status_from_text,
    is_decision_pending,
    is_blocked_on_principal,
    parse_due_date,
)
from engine.rules import needs_deadline_set

TODAY = date(2026, 9, 28)   # a Monday


def make(**kw):
    base = dict(
        unit="Wasla Pay", raw_owner="X", owner="X", description="", due_date_raw="",
        due_date=None, due_date_approx=False, status_raw="Open", status="open",
        status_inferred=False, last_updated=TODAY, blocked_by="", decision_type="",
        regulatory_deadline=None, decision_pending=False, principal_blocked=False,
    )
    base.update(kw)
    return Commitment(**base)


@pytest.mark.parametrize("raw, expected", [
    ("done", "done"), ("Done", "done"), ("complete", "done"), (" Completed ", "done"),
    ("Pending Decision", "pending_decision"), ("in progress", "open"), ("Open", "open"),
    ("", None), (None, None),
])
def test_mart_status_vocabulary(raw, expected):
    assert normalize_status(raw) == expected


@pytest.mark.parametrize("text, expected", [
    ("Rollout resolved, live since last week", "done"),
    ("Still waiting on redlines", "open"),
    ("Sent follow-up, no response yet", "open"),
    ("Quarterly review", "open"),
])
def test_status_inferred_from_text(text, expected):
    assert infer_status_from_text(text) == expected


@pytest.mark.parametrize("raw, expected, approx", [
    ("2026-10-02", date(2026, 10, 2), False),
    ("end of this week", date(2026, 10, 2), True),
    ("end of next week", date(2026, 10, 9), True),
    ("next Tuesday", date(2026, 9, 29), True),
    ("next Monday", date(2026, 10, 5), True),
    ("in 2 weeks", date(2026, 10, 12), True),
    ("", None, False),
    ("TBD", None, True),
])
def test_due_date_parsing(raw, expected, approx):
    assert parse_due_date(raw, TODAY) == (expected, approx)


def test_unreadable_due_date_needs_a_deadline():
    """"TBD" must not be scored as simply not urgent."""
    due, approx = parse_due_date("TBD", TODAY)
    assert needs_deadline_set(make(due_date_raw="TBD", due_date=due, due_date_approx=approx))


def test_decision_trigger_phrases_in_description():
    """Closed vocabulary catches a decision in a unit with no status column."""
    assert is_decision_pending("open", "Waiting on CEO sign-off for the rate card")
    assert is_decision_pending("open", "Awaiting decision from Group Finance")
    assert not is_decision_pending("open", "Got sign-off last week, rolling out")
    assert not is_decision_pending("done", "Pending decision, now closed")


def test_principal_match_is_whole_word():
    assert is_blocked_on_principal("Waiting on CEO sign-off", "")
    assert not is_blocked_on_principal("Awaiting decision on loan principal schedule", "")
    assert not is_blocked_on_principal("Awaiting decision on sale proceeds", "Treasury")


def test_overdue_decision_is_urgent_even_if_recently_pending():
    """Urgency signals are OR'd for every item. A decision 4 days overdue that
    entered Pending Decision only 2 days ago is still urgent."""
    item = make(unit="Wasla Eats", status="pending_decision", decision_pending=True,
                due_date=TODAY - timedelta(days=4), last_updated=TODAY - timedelta(days=2))
    classified = classify_commitment(item, TODAY, blocks=[], rating_missed_units=set())
    assert classified.urgency
    assert classified.quadrant == QUADRANT_NEEDS_DECISION_NOW


def test_core_and_experimental_tiers_score_the_same():
    """Known simplification: only Flagship lifts importance."""
    for unit in ("Wasla Pay", "Wasla Express"):
        c = classify_commitment(make(unit=unit), TODAY, blocks=[], rating_missed_units=set())
        assert not c.importance


def test_item_title_is_text_before_first_comma():
    from engine.rules import item_title
    assert item_title("Lease renewal, still waiting on redlines") == "lease renewal"
    assert item_title("Lease  renewal, countersigned, resolved") == "lease renewal"
    assert item_title("Board pack legal review") == "board pack legal review"


def test_blocked_items_are_neither_stale_nor_overdue():
    """One root cause, listed once: on the blocker's card."""
    from engine.rules import is_stale, is_overdue
    blocker = make(description="Fix alerting", due_date=TODAY - timedelta(days=9),
                   last_updated=TODAY - timedelta(days=9))
    waiting = make(description="Rewrite SOP, draft started", blocked_by="Fix alerting",
                   due_date=TODAY - timedelta(days=2), last_updated=TODAY - timedelta(days=20))
    everything = [blocker, waiting]
    assert is_stale(blocker, TODAY, everything) and is_overdue(blocker, TODAY, everything)
    assert not is_stale(waiting, TODAY, everything)
    assert not is_overdue(waiting, TODAY, everything)


def test_a_pending_decision_is_never_stale():
    """Its wait is measured by the pending clock, not blamed on the owner."""
    from engine.rules import is_stale
    item = make(status="pending_decision", decision_pending=True,
                last_updated=TODAY - timedelta(days=30))
    assert not is_stale(item, TODAY, [item])
