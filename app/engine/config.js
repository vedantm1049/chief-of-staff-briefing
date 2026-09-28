/* Thresholds and unit metadata for the Wasla briefing engine.

Every number here is tied to a specific row in docs/dataset_key.md. Change a
threshold and run the tests to see which scenario it breaks.
*/

// --- Staleness ---------------------------------------------------------------
// An open item not touched in this many days or more is stale. Mart's
// stockout item (8 days) and Express's mall-retail item (14 days) trigger.
// Table's no-show item (7 days) would too, which is the point: only correct
// status inference keeps it out.
export const STALE_THRESHOLD_DAYS = 7;

// --- Conflict ----------------------------------------------------------------
// Two open items, same normalized owner, due dates this many days apart or
// closer. Layla's pair (0 days) and Priya's loyalty pair (1 day) trigger.
// Priya's SLA item, 2 to 3 days further out, does not.
export const CONFLICT_WINDOW_DAYS = 1;

// --- Decision pending ----------------------------------------------------------
// Days in Pending Decision (last_updated used as the "pending since" date)
// before the wait itself makes the item urgent. Zayd (6 days) triggers,
// Nadia Osman (3 days) does not.
export const DECISION_PENDING_URGENT_DAYS = 5;

// Closed trigger-phrase vocabulary, checked against the lowercased
// description. The status value "Pending Decision" is the primary signal;
// these catch units that say the same thing in the description instead,
// including Wasla Table, which has no status column at all.
export const CLOSED_TRIGGER_PATTERNS = [
  /\bpending decision\b/,
  /\bawaiting (a )?decision\b/,
  /\bwaiting on .{0,40}\bsign-off\b/,
  /\bawaiting .{0,40}\bsign-off\b/,
];

// Marks a decision as blocked on the principal (the Group CEO) specifically.
// Whole-word match, so "proceeds" or a loan's "principal" never trigger.
export const PRINCIPAL_PATTERNS = [/\bceo\b/];

// --- Urgency from due dates ------------------------------------------------------
// Overdue, or due within this many days (inclusive), is urgent.
export const DUE_SOON_DAYS = 3;

// --- Importance: dependency fan-out ------------------------------------------------
export const FAN_OUT_THRESHOLD = 2;

// --- Customer-health signal ----------------------------------------------------------
// A unit's rating missing its own target by more than this (1 to 5 scale) is a
// real miss. Mart's 0.57 miss triggers; Eats' and Pay's 0.1 misses do not.
export const RATING_MISS_MARGIN = 0.2;

// Below this many rated interactions in the week, the rating is noise. Same
// number cafe-qc uses for its rated-order floor.
export const MIN_RATED_SAMPLE = 10;

// --- Effort (decision_type to effort). Used only inside the top group, and
// only for decision-pending items.
export const DECISION_TYPE_EFFORT = {
  "confirm/reject": "Low",
  "select-option": "Medium",
  "open-ended": "High",
};
export const EFFORT_ORDER = { Low: 0, Medium: 1, High: 2, Unknown: 3 };

// Status values (case-insensitive) that mean closed.
export const DONE_STATUS_VALUES = new Set(["done", "complete", "completed", "resolved", "closed"]);

// Free-text hints for units with no status column (Wasla Table). Done hints
// are checked first.
export const DONE_TEXT_HINTS = ["resolved", "live since", "closed out", "wrapped up"];
export const OPEN_TEXT_HINTS = ["waiting", "no response", "still", "pending", "follow-up", "follow up"];

// The six Wasla units, in the order they are loaded and shown. `metric` names
// the (rating, target, rated-count) columns in the unit's KPI export. Wasla
// Central has no customer-facing metric and deliberately has none.
export const WASLA_UNITS = [
  { key: "wasla_eats", name: "Wasla Eats", tier: "Flagship",
    metric: ["order_rating_avg", "order_rating_target", "rated_orders_count"] },
  { key: "wasla_mart", name: "Wasla Mart", tier: "Flagship",
    metric: ["order_rating_avg", "order_rating_target", "rated_orders_count"] },
  { key: "wasla_table", name: "Wasla Table", tier: "Core",
    metric: ["diner_rating_avg", "diner_rating_target", "rated_diners_count"] },
  { key: "wasla_express", name: "Wasla Express", tier: "Experimental",
    metric: ["delivery_rating_avg", "delivery_rating_target", "rated_deliveries_count"] },
  { key: "wasla_pay", name: "Wasla Pay", tier: "Core",
    metric: ["transaction_csat_avg", "transaction_csat_target", "rated_transactions_count"] },
  { key: "wasla_central", name: "Wasla Central", tier: "Core", metric: null },
];

export const WASLA_TIERS = Object.fromEntries(WASLA_UNITS.map((u) => [u.name, u.tier]));
