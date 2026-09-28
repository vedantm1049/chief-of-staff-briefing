"""Thresholds and unit metadata for the Wasla briefing engine.

Every number here is tied to a specific row in docs/dataset_key.md. Change a
threshold and run the tests to see which scenario it breaks.
"""
import re
from datetime import date

# Reference "today" for the shipped snapshot (week_ending 2026-09-27).
# Override with: python main.py --today YYYY-MM-DD
DEFAULT_TODAY = date(2026, 9, 28)

# --- Staleness ---------------------------------------------------------------
# An open item not touched in this many days or more is stale. Mart's
# stockout item (8 days) and Express's mall-retail item (14 days) trigger.
# Table's no-show item (7 days) would too, which is the point: only correct
# status inference keeps it out.
STALE_THRESHOLD_DAYS = 7

# --- Conflict ----------------------------------------------------------------
# Two open items, same normalized owner, due dates this many days apart or
# closer. Layla's pair (0 days) and Priya's loyalty pair (1 day) trigger.
# Priya's SLA item, 2 to 3 days further out, does not.
CONFLICT_WINDOW_DAYS = 1

# --- Decision-pending ----------------------------------------------------------
# Days in Pending Decision (last_updated used as the "pending since" date)
# before the wait itself makes the item urgent. Zayd (6 days) triggers,
# Nadia Osman (3 days) does not.
DECISION_PENDING_URGENT_DAYS = 5

# Closed trigger-phrase vocabulary, checked against the description. The
# status value "Pending Decision" is the primary signal; these catch units
# that say the same thing in the description instead, including Wasla Table,
# which has no status column at all.
CLOSED_TRIGGER_PATTERNS = [
    re.compile(r"\bpending decision\b"),
    re.compile(r"\bawaiting (a )?decision\b"),
    re.compile(r"\bwaiting on .{0,40}\bsign-off\b"),
    re.compile(r"\bawaiting .{0,40}\bsign-off\b"),
]

# Marks a decision as blocked on the principal (the Group CEO) specifically.
# Whole-word match, so "proceeds" or a loan's "principal" never trigger.
PRINCIPAL_PATTERNS = [
    re.compile(r"\bceo\b"),
]

# --- Urgency from due dates ------------------------------------------------------
# Overdue, or due within this many days (inclusive), is urgent.
DUE_SOON_DAYS = 3

# --- Importance: dependency fan-out ------------------------------------------------
FAN_OUT_THRESHOLD = 2

# --- Customer-health signal ----------------------------------------------------------
# A unit's rating missing its own target by more than this (1 to 5 scale) is a
# real miss. Mart's 0.57 miss triggers; Eats' and Pay's 0.1 misses do not.
RATING_MISS_MARGIN = 0.2

# Below this many rated interactions in the week, the rating is noise. Same
# number cafe-qc uses for its rated-order floor.
MIN_RATED_SAMPLE = 10

# --- Effort (decision_type -> effort). Used only inside the top quadrant, and
# only for decision-pending items.
DECISION_TYPE_EFFORT = {
    "confirm/reject": "Low",
    "select-option": "Medium",
    "open-ended": "High",
}
EFFORT_ORDER = {"Low": 0, "Medium": 1, "High": 2, "Unknown": 3}

# Status values (case-insensitive) that mean closed.
DONE_STATUS_VALUES = {"done", "complete", "completed", "resolved", "closed"}

# Free-text hints for units with no status column (Wasla Table). Done hints
# are checked first.
DONE_TEXT_HINTS = ("resolved", "live since", "closed out", "wrapped up")
OPEN_TEXT_HINTS = ("waiting", "no response", "still", "pending", "follow-up", "follow up")

UNIT_DISPLAY_NAMES = {
    "wasla_eats": "Wasla Eats",
    "wasla_mart": "Wasla Mart",
    "wasla_table": "Wasla Table",
    "wasla_express": "Wasla Express",
    "wasla_pay": "Wasla Pay",
    "wasla_central": "Wasla Central",
}

UNIT_TIERS = {
    "Wasla Eats": "Flagship",
    "Wasla Mart": "Flagship",
    "Wasla Table": "Core",
    "Wasla Express": "Experimental",
    "Wasla Pay": "Core",
    "Wasla Central": "Core",
}

# Unit -> (rating, target, rated-count) columns in its kpi_export. Wasla Central
# has no customer-facing metric and is deliberately absent.
CUSTOMER_METRIC_COLUMNS = {
    "Wasla Eats": ("order_rating_avg", "order_rating_target", "rated_orders_count"),
    "Wasla Mart": ("order_rating_avg", "order_rating_target", "rated_orders_count"),
    "Wasla Table": ("diner_rating_avg", "diner_rating_target", "rated_diners_count"),
    "Wasla Express": ("delivery_rating_avg", "delivery_rating_target", "rated_deliveries_count"),
    "Wasla Pay": ("transaction_csat_avg", "transaction_csat_target", "rated_transactions_count"),
}
