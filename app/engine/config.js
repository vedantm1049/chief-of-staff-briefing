/* Thresholds, status words and the Wasla sample's setup.

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
// task text. The status "Waiting on decision" is the primary signal;
// these catch tasks that say the same thing in the text instead.
export const CLOSED_TRIGGER_PATTERNS = [
  /\bpending decision\b/,
  /\bawaiting (a )?decision\b/,
  /\bwaiting on .{0,40}\bsign-off\b/,
  /\bawaiting .{0,40}\bsign-off\b/,
];

// --- Urgency from due dates ------------------------------------------------------
// Overdue, or due within this many days (inclusive), is urgent.
export const DUE_SOON_DAYS = 3;

// --- Importance: dependency fan-out ------------------------------------------------
export const FAN_OUT_THRESHOLD = 2;

// --- Customer-health signal ----------------------------------------------------------
// An area's rating missing its own target by more than this (1 to 5 scale) is a
// real miss. Mart's 0.57 miss triggers; Eats' and Pay's 0.1 misses do not.
export const RATING_MISS_MARGIN = 0.2;

// Below this many rated interactions in the week, the rating is noise. Same
// number cafe-qc uses for its rated-order floor.
export const MIN_RATED_SAMPLE = 10;

// --- Effort (decision_type to effort). Used only inside the top group, and
// only for decision-pending items. The template's words first, then the
// older labels, matched without regard to case.
export const DECISION_TYPE_EFFORT = {
  "yes or no": "Low",
  "pick an option": "Medium",
  "open question": "High",
  "confirm/reject": "Low",
  "select-option": "Medium",
  "open-ended": "High",
};
export const EFFORT_ORDER = { Low: 0, Medium: 1, High: 2, Unknown: 3 };

// --- Tier order inside a group. Only Flagship lifts importance; Core and
// Experimental differ only in where their items sit inside a group, Core
// first. In the sample, Express's stalled item sits below the Core items in
// weeks 2 and 3.
export const TIER_ORDER = { Flagship: 0, Core: 1, Experimental: 2 };

// Status values (case-insensitive). The template offers Open, In progress,
// Waiting on decision and Done; the rest are words people type anyway.
export const DONE_STATUS_VALUES = new Set(["done", "complete", "completed", "resolved", "closed"]);
export const DECISION_STATUS_VALUES = new Set(["waiting on decision", "pending decision"]);

// Free-text hints, read from the task when its status is blank. Done hints
// are checked first.
export const DONE_TEXT_HINTS = ["resolved", "live since", "closed out", "wrapped up"];
export const OPEN_TEXT_HINTS = ["waiting", "no response", "still", "pending", "follow-up", "follow up"];

// A customer rating: 1 to 5, a miss when more than 0.2 below target, and
// only judged on 10 or more ratings, the same floor cafe-qc uses.
export const RATING_DEFAULTS = { unit: "out of 5", better: "higher", margin: RATING_MISS_MARGIN,
  marginKind: "points", minCount: MIN_RATED_SAMPLE };

// Common metrics offered in setup. The Chief of Staff picks, edits or types
// their own. A fixed list, never generated.
export const METRIC_SUGGESTIONS = [
  { name: "Sales", unit: "", better: "higher", margin: 5, marginKind: "percent" },
  { name: "Revenue", unit: "", better: "higher", margin: 5, marginKind: "percent" },
  { name: "Orders", unit: "", better: "higher", margin: 5, marginKind: "percent" },
  { name: "Customer rating", ...RATING_DEFAULTS },
  { name: "Net promoter score", unit: "points", better: "higher", margin: 5, marginKind: "points" },
  { name: "On-time delivery", unit: "%", better: "higher", margin: 2, marginKind: "points" },
  { name: "Conversion rate", unit: "%", better: "higher", margin: 0.5, marginKind: "points" },
  { name: "Gross margin", unit: "%", better: "higher", margin: 1, marginKind: "points" },
  { name: "Costs", unit: "", better: "lower", margin: 5, marginKind: "percent" },
  { name: "Cash balance", unit: "", better: "higher", margin: 10, marginKind: "percent" },
  { name: "Pipeline value", unit: "", better: "higher", margin: 10, marginKind: "percent" },
  { name: "New customers", unit: "", better: "higher", margin: 10, marginKind: "percent" },
  { name: "Customer churn", unit: "%", better: "lower", margin: 0.5, marginKind: "points" },
  { name: "Headcount", unit: "people", better: "higher", margin: 5, marginKind: "percent" },
  { name: "Staff attrition", unit: "%", better: "lower", margin: 1, marginKind: "points" },
  { name: "Open support tickets", unit: "", better: "lower", margin: 10, marginKind: "percent" },
  { name: "Response time", unit: "hours", better: "lower", margin: 10, marginKind: "percent" },
  { name: "Defect rate", unit: "%", better: "lower", margin: 0.5, marginKind: "points" },
];

const metric = (name, fields) => ({ ...(METRIC_SUGGESTIONS.find((m) => m.name === name) ?? {}), name, ...fields });
const rating = (target) => metric("Customer rating", { target });

// The Wasla example: its areas, who leads each, how much each matters, the
// metrics each reports, and who the briefing is for. A user's own setup has
// the same shape. Leaders' emails are in data/alias_table.csv.
export const WASLA_SETUP = {
  company: "Wasla Group",
  areaKind: "business",
  boss: "CEO",
  areas: [
    { name: "Wasla Eats", tier: "Flagship", leader: { name: "Farah Al Mansoori", email: "farah.almansoori@wasla.example" },
      metrics: [metric("Orders", { target: 80000 }), metric("On-time delivery", { target: 92 }), rating(4.5)] },
    { name: "Wasla Mart", tier: "Flagship", leader: { name: "Ahmed El-Sayed", email: "ahmed.elsayed@wasla.example" },
      metrics: [metric("Revenue", { unit: "AED", target: 6000000 }), rating(4.5)] },
    { name: "Wasla Table", tier: "Core", leader: { name: "Reem Qassim", email: "reem.qassim@wasla.example" },
      metrics: [metric("Reservations", { unit: "", better: "higher", margin: 5, marginKind: "percent", target: 4000 }), rating(4.5)] },
    { name: "Wasla Express", tier: "Experimental", leader: { name: "Rahul Mehta", email: "rahul.mehta@wasla.example" },
      metrics: [metric("Orders", { target: 1200 }), rating(4.3)] },
    { name: "Wasla Pay", tier: "Core", leader: { name: "Raj Mehta", email: "raj.mehta@wasla.example" },
      metrics: [metric("Transactions", { unit: "", better: "higher", margin: 5, marginKind: "percent", target: 300000 }),
        metric("Dispute rate", { unit: "%", better: "lower", margin: 0.2, marginKind: "points", target: 0.8 }), rating(4.3)] },
    { name: "Wasla Central", tier: "Core", leader: { name: "Omar Siddiqui", email: "omar.siddiqui@wasla.example" },
      metrics: [metric("Roadmap items shipped", { unit: "", better: "higher", margin: 0, marginKind: "points", target: 4 })] },
  ],
};

export const WASLA_TIERS = Object.fromEntries(WASLA_SETUP.areas.map((a) => [a.name, a.tier]));

// Copied on every email draft to an owner. Fictional, on the reserved
// .example domain. The reader can change it on the page.
export const WASLA_CHIEF_OF_STAFF_EMAIL = "chief.of.staff@wasla.example";
