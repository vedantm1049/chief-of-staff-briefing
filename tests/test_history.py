"""Weeks 2 to 4 of docs/dataset_key.md: carry-overs, closures and the
week-over-week comparison. Each docstring states the row it proves.
"""
import csv
import os
from datetime import date

from engine.classify import (
    QUADRANT_NEEDS_DECISION_NOW,
    QUADRANT_ON_YOUR_RADAR,
    QUADRANT_FLAG_DONT_ESCALATE,
)
from engine.history import build_history
from tests.conftest import find_commitment

W1, W2, W3, W4 = "2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18"


def hist(b, c):
    return b.comparison.items[id(c)]


def closed(b, title_start):
    matches = [x for x in b.comparison.closed if x.before.description.startswith(title_start)]
    assert len(matches) == 1, f"expected 1 closed item starting {title_start!r}, got {len(matches)}"
    return matches[0]


# --- Whole history -------------------------------------------------------------------

def test_four_weeks_scored_the_monday_after(history):
    assert list(history) == [W1, W2, W3, W4]
    for week, b in history.items():
        assert b.week_ending == date.fromisoformat(week)
        assert (b.today - b.week_ending).days == 1


def test_kpi_week_ending_matches_folder(history):
    for week, b in history.items():
        stamped = {str(u.kpi["week_ending"]) for u in b.units.values() if u.kpi.get("week_ending")}
        assert stamped == {week}


def test_no_two_items_share_a_title(history):
    for b in history.values():
        assert b.comparison.duplicate_titles == []


def test_week_one_is_a_baseline(history):
    b = history[W1]
    assert b.comparison.previous_week is None
    assert {h.label for h in b.comparison.items.values()} == {"baseline"}
    assert b.comparison.closed == []


# --- Week 2 ------------------------------------------------------------------------

def test_w2_decisions_and_deliveries_close_as_done(history):
    """Zayd's decision, both loyalty-pilot sides and Pay's compliance amendment
    were all flagged in week 1 and marked done by week 2."""
    b = history[W2]
    for start in ("Waiting on CEO sign-off on partner-tier", "Launch loyalty-points pilot",
                  "Loyalty-points pilot data integration", "Finalize compliance amendment"):
        assert closed(b, start).outcome == "done"


def test_w2_touched_but_overdue_item_stays_on_the_briefing(history):
    """The stockout fix was touched on 1 Oct, so it is no longer stale, but it
    is 16 days overdue. The overdue rule keeps it at the top, 2nd week running."""
    b = history[W2]
    item = find_commitment(b, description_contains="stockout alerting")
    classified = b.classified[id(item)]
    assert classified.flags == ["overdue"]
    assert classified.quadrant == QUADRANT_NEEDS_DECISION_NOW
    assert hist(b, item).label == "running" and hist(b, item).weeks_running == 2


def test_w2_carry_over_follows_the_item_not_the_flag(history):
    """Layla's lease was a conflict in week 1 and is overdue in week 2. Same
    item, so it reads as 2nd week running, not new."""
    b = history[W2]
    lease = find_commitment(b, owner="Layla Haddad", unit="Wasla Table")
    assert b.classified[id(lease)].flags == ["overdue"]
    assert hist(b, lease).weeks_running == 2


def test_w2_free_text_due_date_rolls_forward(history):
    """Mina's item says "next Tuesday" every week, so it is never overdue.
    The history shows the date moving: 29 Sep, then 6 Oct."""
    b = history[W2]
    mina = find_commitment(b, owner="Mina")
    h = hist(b, mina)
    assert h.due_dates == [date(2026, 9, 29), date(2026, 10, 6)]
    assert h.due_raw == "next Tuesday"


def test_w2_legal_decision_rises_as_the_wait_grows(history):
    """Nadia Osman's KYC decision: omitted in week 1 at 3 days pending, flagged
    in week 2 at 10 days. A decision's wait is never labelled stale."""
    b = history[W2]
    item = find_commitment(b, owner="Nadia Osman")
    classified = b.classified[id(item)]
    assert classified.quadrant == QUADRANT_FLAG_DONT_ESCALATE
    assert "stale" not in classified.flags


def test_w2_new_ceo_decision_is_new(history):
    b = history[W2]
    item = find_commitment(b, owner="Farah Al Mansoori", description_contains="expansion budget")
    assert hist(b, item).label == "new"
    assert b.classified[id(item)].quadrant == QUADRANT_ON_YOUR_RADAR
    assert b.classified[id(item)].effort == "Medium"


def test_w2_blank_mart_status_read_from_text(history):
    b = history[W2]
    sop = find_commitment(b, description_contains="SOP rewrite")
    assert sop.status_raw == "" and sop.status_inferred and sop.status == "open"
    assert id(sop) not in b.classified   # blocked by the stockout fix


def test_w2_touched_item_clears(history):
    x = closed(history[W2], "Update group-wide data-processing")
    assert x.outcome == "cleared" and "updated 2 Oct" in x.detail


# --- Week 3 ------------------------------------------------------------------------

def test_w3_stockout_fix_closes_after_two_weeks(history):
    x = closed(history[W3], "Fix stockout alerting")
    assert x.outcome == "done" and x.weeks_flagged == 2
    assert x.now.status_raw == "done"   # Mart's lowercase vocabulary


def test_w3_blocker_done_exposes_stalled_item(history):
    """With the stockout fix done, the forecast model's 24-day silence counts.
    It shows up new, with its due date moved from 12 Oct to 19 Oct."""
    b = history[W3]
    item = find_commitment(b, description_contains="forecast model")
    assert b.classified[id(item)].flags == ["stale"]
    assert hist(b, item).label == "new"
    assert hist(b, item).due_dates == [date(2026, 10, 12), date(2026, 10, 19)]


def test_w3_deadline_set_clears_the_workshop(history):
    x = closed(history[W3], "Q4 product roadmap")
    assert x.outcome == "cleared" and "deadline set for 22 Oct" in x.detail


def test_w3_missing_kpi_column_is_tolerated(history):
    express = history[W3].units["wasla_express"]
    assert "avg_delivery_time_min" not in express.kpi
    assert express.customer_metric["rating"] == 3.6


# --- Week 4, the landing page -------------------------------------------------------

def test_w4_top_quadrant_order(history):
    """Raj's confirm/reject (Low effort) above Farah's three-option choice
    (Medium), even though Farah has waited longer. Then Mina."""
    top = [i.commitment.owner for i in history[W4].quadrants[QUADRANT_NEEDS_DECISION_NOW]]
    assert top == ["Raj Mehta", "Farah Al Mansoori", "Mina"]


def test_w4_waiting_on_the_ceo_three_weeks(history):
    b = history[W4]
    item = find_commitment(b, owner="Farah Al Mansoori", description_contains="expansion budget")
    assert hist(b, item).weeks_running == 3
    assert "overdue" in b.classified[id(item)].flags


def test_w4_rating_miss_lifts_an_experimental_unit(history):
    """Express clears the 10-rating floor for the first time (15 ratings) and
    misses by 0.5. That lifts Mina's untouched item to the top quadrant, in its
    4th week running, with its due date moved four times."""
    b = history[W4]
    express = next(r for r in b.customer_health if r.unit_name == "Wasla Express")
    assert express.triggered and express.count == 15
    mina = find_commitment(b, owner="Mina")
    assert b.classified[id(mina)].quadrant == QUADRANT_NEEDS_DECISION_NOW
    assert hist(b, mina).weeks_running == 4
    assert len(hist(b, mina).due_dates) == 4


def test_w4_blocked_by_matches_a_title(history):
    """Zayd's onboarding item names Mina's item by title only."""
    b = history[W4]
    mina = find_commitment(b, owner="Mina")
    onboarding = find_commitment(b, owner="Zayd")
    assert onboarding in b.classified[id(mina)].blocks


def test_w4_item_deleted_without_being_done(history):
    x = closed(history[W4], "Diner NPS survey redesign")
    assert x.outcome == "dropped" and x.now is None and x.weeks_flagged == 3


def test_w4_workshop_is_back(history):
    """Flagged weeks 1 and 2, cleared in week 3, back in week 4 in a same-day
    clash with Omar's results-call prep."""
    b = history[W4]
    workshop = find_commitment(b, description_contains="roadmap prioritization")
    h = hist(b, workshop)
    assert h.label == "returned" and h.last_flagged == date(2026, 10, 4)
    assert [p.owner for p in b.conflicts] == ["Omar Siddiqui"]


def test_w4_mart_rating_recovered(history):
    b = history[W4]
    now = next(r for r in b.customer_health if r.unit_name == "Wasla Mart")
    before = b.comparison.prev_health["Wasla Mart"]
    assert before.triggered and not now.triggered


def test_w4_unseen_name_is_reported(history):
    assert history[W4].unresolved_owners == [("L. Haddad", "Wasla Eats")]


def test_w4_fixing_the_alias_table_reveals_a_hidden_clash(full_copy):
    """Adding "L. Haddad" to the alias table shows Layla on the Eats vendor
    agreement (due 21 Oct) and her board pack review (due 20 Oct). The Eats
    item is Flagship and due in 2 days: it goes straight to the top."""
    with open(full_copy / "alias_table.csv", "a", newline="") as f:
        csv.writer(f).writerow(["L. Haddad", "Wasla Eats", "Layla Haddad", "added after week 4 review"])
    b = build_history(os.path.join(full_copy, "weeks"), alias_path=str(full_copy / "alias_table.csv"))[-1]
    assert b.unresolved_owners == []
    assert sorted(p.owner for p in b.conflicts) == ["Layla Haddad", "Omar Siddiqui"]
    msa = find_commitment(b, description_contains="rider-fleet")
    assert b.classified[id(msa)].quadrant == QUADRANT_NEEDS_DECISION_NOW


def test_reassigned_item_keeps_its_history(full_copy):
    """Identity is unit plus title, not owner. Hand Layla's lease to Reem in
    week 3 and it is still the 3rd week running, not a new item."""
    from tests.conftest import edit_csv
    path = full_copy / "weeks" / W3 / "wasla_table" / "commitments.csv"
    edit_csv(path, {"owner": "Layla Haddad"}, {"owner": "Reem Qassim"})
    b = build_history(os.path.join(full_copy, "weeks"), alias_path=str(full_copy / "alias_table.csv"))[2]
    lease = find_commitment(b, description_contains="countersign")
    assert lease.owner == "Reem Qassim"
    assert hist(b, lease).weeks_running == 3
