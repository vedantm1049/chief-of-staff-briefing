# Chief of Staff Briefing, Data Contract

Working spec. Fictional scenario, real deterministic engine, same posture as `scan`: not in production, not pretending to be.

## 1. Fictional structure

**Wasla Group**, a fictional Dubai-based multi-vertical super-app holding company. Business-line mix modeled on the real shape of regional aggregators (Talabat, noon, Careem), not on any single real company's actual internals or figures.

**Principal:** Group CEO. The briefing is what a Chief of Staff prepares for the Group CEO every week. "Wasla" is a placeholder name, swap freely.

## 2. The six units

| Unit | Business line | Priority tier | Why this tier |
|---|---|---|---|
| Wasla Eats | Food delivery marketplace/aggregator | Flagship | The anchor business, largest and most established |
| Wasla Mart | Dark-store rapid grocery delivery | Flagship | The other major growth bet, alongside Eats |
| Wasla Table | Dine-out reservations and in-restaurant payments | Core | Mature, stable, not a primary growth engine |
| Wasla Express | 1-2 hour delivery from third-party listed stores | Experimental | Newest bet, still proving itself |
| Wasla Pay | Payments and wallet services | Core | Important infrastructure, not itself the growth story |
| Wasla Central | Shared services: legal, design, investor relations, tech/product, and group-wide growth/loyalty programs | Core | Bundled, serves every other unit, doesn't compete for growth |

2 Flagship, 3 Core, 1 Experimental. Keeps the tier doing real classification work instead of everything landing in one bucket.

## 3. Per-unit inputs

Each unit supplies three inputs weekly: a KPI export, a free-text status update, and an open-commitments list. Format and voice deliberately differ unit to unit, this is the "messy" part doing its job, not decoration.

**Wasla Eats.** KPI export: CSV. Fields: `week_ending, orders, gmv_aed, on_time_delivery_pct, active_restaurant_partners, marketplace_take_rate_pct, order_rating_avg, order_rating_target, rated_orders_count`. Status update: three terse bullets, Slack-register. Commitments: clean status field (Open/In Progress/Done), ISO dates, full names as owners.

**Wasla Mart.** KPI export: Excel workbook, one tab per city cluster (Dubai, Abu Dhabi, Sharjah). Fields per tab: `units_picked, stockout_rate_pct, avg_pick_time_min, revenue_aed, dark_store_count, order_rating_avg, order_rating_target, rated_orders_count`. Status update: a longer narrative paragraph, key facts sometimes buried mid-paragraph rather than led with. Commitments: status field present but inconsistent values ("done", "Done", "complete", "in progress", blank), owners mostly full names with an initial-plus-surname shorthand mixed in ("P. Nair").

**Wasla Table.** KPI export: single CSV, minimal fields: `week_ending, reservations_confirmed, no_show_rate_pct, covers_seated, revenue_aed, diner_rating_avg, diner_rating_target, rated_diners_count`. A field is occasionally missing for a given week, this unit's reporting is the least mature. Status update: one or two lines only. Commitments: no status field at all, status must be inferred from free text in the description ("resolved", "still waiting on X", "sent follow-up").

**Wasla Express.** KPI export: CSV pulled from a spreadsheet, columns inconsistent week to week, a metric sometimes absent entirely. Fields when present: `orders, avg_delivery_time_min, partner_store_count, gmv_aed, delivery_rating_avg, delivery_rating_target, rated_deliveries_count`. Status update: enthusiastic, hype-forward prose, light on hard numbers, a deliberate trap for the staleness detector, momentum language can mask an item that hasn't actually moved. Commitments: due dates sometimes written as free text ("end of next week") instead of a date field, owners as first-name-only.

**Wasla Pay.** KPI export: CSV, formal and compliance-flavored: `week_ending, transactions_processed, take_rate_bps, wallet_signups, dispute_rate_pct, compliance_flags_open, transaction_csat_avg, transaction_csat_target, rated_transactions_count`. Status update: structured, jargon-heavy. Commitments: clean status field, full names, plus a `regulatory_deadline` flag on some items that no other unit's schema has, another normalization case.

**Wasla Central.** KPI export: operational counts, not commercial metrics: `open_legal_matters, pending_design_requests, investor_meetings_this_month, product_roadmap_items_shipped`, genuinely different shape from the other five. Status update: one short line per sub-function (legal, design, IR, tech/product, growth) inside a single update. Commitments: this is the deliberate conflict-generator, Central owners show up as the assigned owner on OTHER units' items too, not just their own, because their job is to serve every unit at once, not one P&L. Two examples: the same legal counsel owns both a Wasla Table contract review and a Wasla Pay compliance item, due the same week; the same growth/loyalty lead owns the Eats-side and Mart-side of one joint loyalty-points pilot. Every cross-unit owner in this dataset is Central staff for exactly this reason, a business-line owner showing up in two unrelated units with no stated reason would be a credibility hole, not a feature.

## 4. Messiness catalog

Concrete and testable, not vibes:

- Different file shapes across units (single CSV, multi-tab Excel, sparse CSV with gaps)
- No shared column names or schema across units
- Status vocabulary inconsistent ("done" / "Done" / "complete" / blank) or absent entirely, requiring inference from free text
- Owner-name format inconsistent across units (full name, initial plus surname, first-name-only), including at least one genuinely ambiguous pair for the alias-resolution step to catch
- Due dates as ISO date, free text ("end of next week"), or missing
- At least one unit (Express) missing a KPI field in a given week, the engine must handle absence, not assume every field is always present

## 5. Scoring recap

Decisions already locked, restated here for one place to check them:

- Detection rules: staleness, overdue, conflict (same normalized owner, overlapping date windows), decision-pending (closed trigger-phrase vocabulary), each a boolean rule against stated fields. An open item waiting on another open tracked item is blocked, neither stale nor overdue, and is listed on its blocker instead. A pending decision is never called stale: its wait is measured by its own pending clock
- Items with no usable due date (blank, or free text the engine can't read, like "TBD") are flagged "needs a deadline set," not scored as zero urgency
- Classification: importance x urgency 2x2 grid. Importance from unit priority tier, decision-pending-on-principal flag, or dependency fan-out (2+ other open items blocked by this one). Urgency from overdue days, due-within-3-days, or pending-5+-days
- Effort sort (Low/Medium/High from a stated `decision_type` field) applies only inside the "needs your decision now" quadrant, only to decision-pending items.
- Tier order: only Flagship lifts importance, but inside every quadrant items are ordered Flagship, then Core, then Experimental, then most overdue first. In the top quadrant, decision-pending items still come first by effort, with tier breaking ties. Every commitments file with a status column carries `decision_type`, filled only on decision-pending rows
- A third importance signal: each customer-facing unit's rating metric (`order_rating_avg`, `diner_rating_avg`, `delivery_rating_avg`, or `transaction_csat_avg`, unit-specific name, same 1-5 scale throughout) misses its own stated target by more than a set margin this week. Ratings, not retention, deliberately, retention is a lagging metric and moves too slowly to earn a place in a weekly briefing, a rating reflects this week's actual customer experience. Single week only, not a trend. Subject to a minimum-sample floor of 10 rated interactions this week (the matching `rated_*_count` field), same number cafe-qc uses for its rated-order threshold, so a low-volume week for a small unit like Wasla Express doesn't falsely trigger on noise. Wasla Central has no customer-facing metric and is excluded from this rule
- Alias resolution is an offline, one-time curation step, fuzzy-match candidates flagged and human-confirmed while building the dataset, producing a static alias table the shipped engine reads. The runtime engine never calls an LLM. An owner name the table has never seen is reported in the briefing, not guessed at, since a new shorthand could hide a conflict

## 6. Out of scope

Auto-suggested resolutions or next steps beyond flagging. A chat/Q&A layer on top. Trend analysis of metrics across weeks (flagged items do carry over week to week, see section 7). More than one output format, static, no-backend, single page, same approach as `scan`.

## 7. Changes after v1

Found while building and reviewing the engine:

- `decision_type` added to the commitments files. The effort sort depends on it and the dataset key referenced it, but the generator never wrote it.
- Nadia Osman's due date moved from 2026-10-01 to 2026-10-08. At exactly 3 days out it tripped the due-within-3-days urgency rule, which contradicted the key's "low urgency, omit" outcome for that row.
- Blocked items are no longer flagged stale (see section 5). Without this, Mart's one stalled stockout fix showed up as three stale items.
- A Mart row with lowercase "complete" status added, so the status vocabulary this contract claims for Mart is actually exercised.
- Mart owner-format wording corrected to match the data ("P. Nair", not "First L.").

Added with weeks 2 to 4 of the sample data:

- Four weekly snapshots instead of one, under `data/weeks/<week_ending>/`, with one shared alias table. Each week is scored as of the Monday after it.
- **Overdue** became a detection rule. Week 2 exposed the gap: the stockout fix, 16 days late on a Flagship unit, was touched once, stopped being stale, and vanished from the briefing, because lateness alone flagged nothing.
- A pending decision is no longer also flagged stale. Waiting on the CEO or on Legal is not the owner's neglect, and the pending clock already measures it.
- `blocked_by` can name an item by its title, not only its full description.
- **Week-over-week comparison.** An item's identity across weeks is its unit plus its title, the text before the first comma. Owner is left out, so a reassigned item keeps its history; a renamed item does not. Every flagged item is marked new, back after a gap, or its Nth week running. Items flagged last week but not this week are listed as done, cleared (with why: date moved, deadline set, updated), or removed from the tracker without being marked done. Due dates that keep moving are shown, which is what exposes free-text dates like "next Tuesday" rolling forward on their own. Last week's customer rating sits next to this week's; the rating rule itself still judges one week only.

Added with the move to a browser app:

- **Tier order inside a group.** Core used to score and sort the same as Experimental. Now items inside each quadrant are ordered Flagship, then Core, then Experimental, before most overdue. Grouping is unchanged: only Flagship lifts importance, so no item changes quadrant. In the sample this moves Wasla Express's stalled item below the Core items in "flag, don't escalate" in weeks 2 and 3.
- **The rules moved to the browser.** The Python engine and its static pages are gone; the same rules now run as JavaScript in one static page (`index.html`, `app/engine/`). No rule changed in the move: both engines were run over all four weeks and matched on every item, flag, group, order, history label and closed item before the Python copy was deleted. Tests moved one to one, under Node's built-in test runner.
- **The reader's own edits.** On the page, the reader can tick an item done or set its due date. An edit applies to the week it was made in and is scored like data from the unit. The next week's files replace it: new data wins. An item closed this way is listed as "marked done by you". Edits are kept in the reader's browser only, with export and import as a backup file.
- **Notes, owner emails and replies.** The reader can add a note to any item on the page, marked as from the CEO or the Chief of Staff. A note stays with its item from week to week (unit plus title, as above) and shows from the week it was written. The alias table gained an `email` column, one fictional address per owner on the reserved `.example` domain. "Draft email" opens a draft in the reader's own email app with the note and the card's facts; the page sends nothing and adds no advice of its own. The owner's answer is pasted back onto the note as a reply. A name missing from the alias table has no email, so no address is guessed. Notes never change a score. They are kept in the reader's browser with the edits and go into the same backup file.
- **The Chief of Staff is copied on every email draft.** The sample uses a fictional `chief.of.staff@wasla.example`; the reader can set their own address on the page, and it is saved with the backup. They are not copied on a draft addressed to themselves.
