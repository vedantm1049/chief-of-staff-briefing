"""One test per row of docs/dataset_key.md. The dataset was designed as a test
plan; this file makes it executable. Each docstring states the row it proves.
"""
from engine.briefing import build_briefing
from engine.classify import (
    QUADRANT_NEEDS_DECISION_NOW,
    QUADRANT_FLAG_DONT_ESCALATE,
    QUADRANT_OMIT,
)
from engine.config import DEFAULT_TODAY
from tests.conftest import find_commitment, edit_csv


# --- Conflicts ------------------------------------------------------------------

def test_layla_haddad_same_day_conflict(briefing):
    """Layla Haddad: Table's lease renewal and Pay's compliance amendment, both
    due 2026-09-29. Same day, no alias resolution needed."""
    lease = find_commitment(briefing, owner="Layla Haddad", unit="Wasla Table")
    compliance = find_commitment(briefing, owner="Layla Haddad", unit="Wasla Pay")
    assert compliance in briefing.conflict_partner_map.get(id(lease), [])
    assert lease in briefing.conflict_partner_map.get(id(compliance), [])


def test_priya_nair_conflict_depends_on_alias_merge(briefing):
    """Priya Nair / P. Nair: Eats' and Mart's loyalty-pilot items, one day
    apart. Only visible if "P. Nair" merges into "Priya Nair"."""
    eats = find_commitment(briefing, owner="Priya Nair", unit="Wasla Eats",
                           description_contains="loyalty-points")
    mart = find_commitment(briefing, owner="Priya Nair", unit="Wasla Mart")
    assert mart.raw_owner == "P. Nair"
    assert mart in briefing.conflict_partner_map.get(id(eats), [])


def test_priya_sla_item_outside_conflict_window(briefing):
    """Priya's SLA item (due 2026-10-05) is 2 to 3 days from the loyalty pair
    and must not be pulled into the conflict."""
    sla = find_commitment(briefing, owner="Priya Nair", description_contains="SLA")
    assert id(sla) not in briefing.conflict_partner_map


def test_exactly_two_conflicts(briefing):
    assert sorted(p.owner for p in briefing.conflicts) == ["Layla Haddad", "Priya Nair"]


# --- Alias resolution -------------------------------------------------------------

def test_rahul_and_raj_mehta_stay_distinct(briefing):
    """False-positive trap: reviewed in the alias table and not merged."""
    rahul = find_commitment(briefing, description_contains="commission floor")
    raj = find_commitment(briefing, description_contains="acquiring bank")
    assert (rahul.owner, raj.owner) == ("Rahul Mehta", "Raj Mehta")


def test_nadia_osman_and_nadia_farouk_stay_distinct(briefing):
    assert find_commitment(briefing, description_contains="Wallet KYC").owner == "Nadia Osman"
    assert find_commitment(briefing, description_contains="forecast model").owner == "Nadia Farouk"


def test_every_owner_resolved_this_week(briefing):
    assert briefing.unresolved_owners == []


def test_unseen_shorthand_is_reported_not_guessed(data_copy):
    """If Mart writes "P Nair" (no dot), the table has never seen it. The engine
    must report it, and the Priya conflict disappears until the table is fixed.
    That lost conflict is why an unresolved name is surfaced, not ignored."""
    edit_csv(data_copy / "wasla_mart" / "commitments.csv", {"owner": "P. Nair"}, {"owner": "P Nair"})
    b = build_briefing(str(data_copy), today=DEFAULT_TODAY)
    assert ("P Nair", "Wasla Mart") in b.unresolved_owners
    assert [p.owner for p in b.conflicts] == ["Layla Haddad"]


# --- Staleness ------------------------------------------------------------------

def test_mart_stockout_stale_and_top_quadrant(briefing):
    """Due 2026-09-19 (9 days overdue), last touched 2026-09-20, blocks 2 open
    items. Lands in needs decision now, on a staleness flag."""
    item = find_commitment(briefing, description_contains="stockout alerting")
    assert id(item) in briefing.stale_ids
    assert len(briefing.blocks_map[id(item)]) == 2
    classified = briefing.classified[id(item)]
    assert classified.quadrant == QUADRANT_NEEDS_DECISION_NOW
    assert "stale" in classified.flags


def test_items_blocked_by_stockout_are_not_stale(briefing):
    """SOP rewrite (7 days) and Q4 forecast model (10 days) are past the
    threshold by date, but they are waiting on the stockout fix. Listed on the
    blocker's card, not flagged as stale in their own right."""
    blocker = find_commitment(briefing, description_contains="stockout alerting")
    for text in ("SOP rewrite", "forecast model"):
        item = find_commitment(briefing, description_contains=text)
        assert id(item) not in briefing.stale_ids
        assert id(item) not in briefing.classified
        assert item in briefing.blocks_map[id(blocker)]


def test_blocked_item_goes_stale_once_blocker_closes(data_copy):
    """The exemption only holds while the blocker is open."""
    edit_csv(data_copy / "wasla_mart" / "commitments.csv",
             {"description": "Fix stockout alerting for Sharjah dark stores"}, {"status": "Done"})
    b = build_briefing(str(data_copy), today=DEFAULT_TODAY)
    forecast = find_commitment(b, description_contains="forecast model")
    assert id(forecast) in b.stale_ids


def test_express_mall_retail_stale_despite_hype(briefing):
    """Last touched 2026-09-14 (14 days) while the status update calls it
    "huge momentum". last_updated wins over prose."""
    item = find_commitment(briefing, owner="Mina")
    assert (briefing.today - item.last_updated).days == 14
    assert id(item) in briefing.stale_ids
    assert id(item) in briefing.classified


def test_table_no_show_fee_resolved_not_stale(briefing):
    """No status column; description says "resolved, live since last week".
    Inferring done must suppress an item that looks overdue and stale."""
    item = find_commitment(briefing, description_contains="no-show fee")
    assert item.status_inferred and item.status == "done"
    assert id(item) not in briefing.stale_ids
    assert id(item) not in briefing.classified


def test_mart_complete_status_drops_out(briefing):
    """Lowercase "complete", Mart's non-standard vocabulary. Misread as open it
    would be overdue, stale and Flagship."""
    item = find_commitment(briefing, description_contains="picker-shift rota")
    assert item.status == "done" and not item.status_inferred
    assert id(item) not in briefing.stale_ids
    assert id(item) not in briefing.classified


# --- Decision-pending ------------------------------------------------------------

def test_zayd_ceo_decision_tops_the_briefing(briefing):
    """Waiting on CEO sign-off, pending 6 days, confirm/reject. First item in
    the top quadrant."""
    item = find_commitment(briefing, owner="Zayd")
    assert item.decision_pending and item.principal_blocked
    classified = briefing.classified[id(item)]
    assert classified.quadrant == QUADRANT_NEEDS_DECISION_NOW
    assert classified.effort == "Low"
    assert briefing.quadrants[QUADRANT_NEEDS_DECISION_NOW][0].commitment is item


def test_nadia_osman_legal_decision_omitted(briefing):
    """Blocked on Central Legal, pending 3 days, Core tier, no fan-out, due
    more than 3 days out. Low importance, low urgency: omit."""
    item = find_commitment(briefing, owner="Nadia Osman")
    assert item.decision_pending and not item.principal_blocked
    classified = briefing.classified[id(item)]
    assert not classified.importance and not classified.urgency
    assert classified.quadrant == QUADRANT_OMIT


# --- No due date ------------------------------------------------------------------

def test_roadmap_workshop_needs_a_deadline(briefing):
    item = find_commitment(briefing, description_contains="roadmap prioritization")
    assert item.due_date is None
    assert item in briefing.needs_deadline_items
    assert id(item) not in briefing.classified


# --- Customer health -----------------------------------------------------------------

def _health(briefing, unit):
    return next(r for r in briefing.customer_health if r.unit_name == unit)


def test_mart_blended_rating_miss_triggers(briefing):
    r = _health(briefing, "Wasla Mart")
    assert round(r.rating, 2) == 3.93 and r.triggered


def test_eats_and_pay_small_misses_do_not_trigger(briefing):
    for unit in ("Wasla Eats", "Wasla Pay"):
        r = _health(briefing, unit)
        assert round(r.miss, 2) == 0.1 and not r.triggered


def test_express_big_miss_suppressed_by_sample_floor(briefing):
    r = _health(briefing, "Wasla Express")
    assert r.count == 6 and r.low_sample and not r.triggered


def test_central_has_no_customer_metric(briefing):
    assert "Wasla Central" not in {r.unit_name for r in briefing.customer_health}


def test_rating_miss_lifts_importance(briefing):
    """Mart's miss is listed as an importance reason on its items."""
    item = find_commitment(briefing, description_contains="stockout alerting")
    reasons = briefing.classified[id(item)].importance_reasons
    assert any("customer-rating" in r for r in reasons)


def test_rating_miss_changes_quadrant_for_non_flagship_unit(briefing, data_copy):
    """In the shipped snapshot only Mart misses, and Mart is already Flagship,
    so the signal moves nothing. Make Table miss (4.0 vs 4.5 on 1,150 ratings):
    Layla's lease renewal must move up from flag-don't-escalate."""
    before = find_commitment(briefing, owner="Layla Haddad", unit="Wasla Table")
    assert briefing.classified[id(before)].quadrant == QUADRANT_FLAG_DONT_ESCALATE

    edit_csv(data_copy / "wasla_table" / "kpi_export.csv", {}, {"diner_rating_avg": "4.0"})
    b = build_briefing(str(data_copy), today=DEFAULT_TODAY)
    after = find_commitment(b, owner="Layla Haddad", unit="Wasla Table")
    assert b.classified[id(after)].quadrant == QUADRANT_NEEDS_DECISION_NOW


# --- Format and schema messiness ------------------------------------------------------

def test_mart_kpi_from_multi_tab_excel(briefing):
    mart = briefing.units["wasla_mart"]
    assert set(mart.kpi_breakdown) == {"Dubai", "Abu Dhabi", "Sharjah"}
    assert mart.kpi_breakdown["Sharjah"]["order_rating_avg"] == 3.7


def test_express_missing_gmv_is_none_not_zero(briefing):
    assert briefing.units["wasla_express"].kpi.get("gmv_aed") is None


def test_table_status_always_inferred(briefing):
    table = [c for c in briefing.all_commitments if c.unit == "Wasla Table"]
    assert len(table) == 3 and all(c.status_inferred for c in table)


def test_pay_regulatory_deadline_loaded_but_unscored(briefing):
    assert find_commitment(briefing, owner="Layla Haddad", unit="Wasla Pay").regulatory_deadline is True


def test_week_ending_read_from_data(briefing):
    assert str(briefing.week_ending) == "2026-09-27"
