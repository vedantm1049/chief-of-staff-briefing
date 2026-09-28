"""
Generates the Wasla Group synthetic dataset: four weekly snapshots, week
ending 2026-09-27, 10-04, 10-11 and 10-18. Each week is scored as of the
Monday after it (09-28, 10-05, 10-12, 10-19).

Every row is hand-designed to exercise a specific rule, not randomized.
docs/dataset_key.md says which row proves which rule, week by week.

Run from anywhere: python scripts/generate_dataset.py
Writes data/weeks/<week_ending>/<unit>/ and data/alias_table.csv.
"""
import csv
import os
import shutil

import pandas as pd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

STATUS_COLS = ["owner", "description", "due_date", "status", "last_updated", "blocked_by", "decision_type"]
PAY_COLS = ["owner", "description", "due_date", "status", "regulatory_deadline", "last_updated",
            "blocked_by", "decision_type"]
TABLE_COLS = ["owner", "description", "due_date", "last_updated"]   # no status column, by design

EATS_KPI = ["week_ending", "orders", "gmv_aed", "on_time_delivery_pct", "active_restaurant_partners",
            "marketplace_take_rate_pct", "order_rating_avg", "order_rating_target", "rated_orders_count"]
MART_KPI = ["units_picked", "stockout_rate_pct", "avg_pick_time_min", "revenue_aed", "dark_store_count",
            "order_rating_avg", "order_rating_target", "rated_orders_count"]
TABLE_KPI = ["week_ending", "reservations_confirmed", "no_show_rate_pct", "covers_seated", "revenue_aed",
             "diner_rating_avg", "diner_rating_target", "rated_diners_count"]
EXPRESS_KPI = ["orders", "avg_delivery_time_min", "partner_store_count", "gmv_aed",
               "delivery_rating_avg", "delivery_rating_target", "rated_deliveries_count"]
PAY_KPI = ["week_ending", "transactions_processed", "take_rate_bps", "wallet_signups", "dispute_rate_pct",
           "compliance_flags_open", "transaction_csat_avg", "transaction_csat_target", "rated_transactions_count"]
CENTRAL_KPI = ["open_legal_matters", "pending_design_requests", "investor_meetings_this_month",
               "product_roadmap_items_shipped"]

STOCKOUT = "Fix stockout alerting for Sharjah dark stores"
LEASE = "Review and countersign Downtown Dubai flagship lease renewal"
NPS = "Diner NPS survey redesign, sent follow-up to vendor, no response yet"
MALL = "Mall-retail partner integration testing, huge momentum, on the verge of a big unlock"
BUDGET = "Waiting on CEO sign-off on Sharjah expansion budget, three options in memo"
EXTEND = "Waiting on CEO sign-off to extend acquiring-bank contract by 12 months"
WORKSHOP = "Q4 product roadmap prioritization workshop"


def write_csv(path, header, rows):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def write_text(path, text):
    with open(path, "w") as f:
        f.write(text.strip() + "\n")


def write_unit(week, unit, kpi, status, commitments):
    d = os.path.join(ROOT, "weeks", week, unit)
    os.makedirs(d, exist_ok=True)
    if unit == "wasla_mart":
        with pd.ExcelWriter(os.path.join(d, "kpi_export.xlsx")) as xl:
            for tab, vals in kpi.items():
                pd.DataFrame([vals], columns=MART_KPI).to_excel(xl, sheet_name=tab, index=False)
    else:
        header, row = kpi
        write_csv(os.path.join(d, "kpi_export.csv"), header, [row])
    write_text(os.path.join(d, "status_update.txt"), status)
    header, rows = commitments
    write_csv(os.path.join(d, "commitments.csv"), header, rows)


# ======================================================================
# Week 1, ending 2026-09-27 (scored 2026-09-28). Unchanged from v1.
# ======================================================================
W = "2026-09-27"
write_unit(W, "wasla_eats",
    (EATS_KPI, ["2026-09-27", 84500, 6180000, 91.4, 3120, 18.5, 4.4, 4.5, 52300]),
    """
- GMV up 4% WoW, on pace for the quarter.
- Partner onboarding: 12 new restaurants live in Sharjah, 3 more in final agreement stage.
- On-time delivery dipped slightly to 91.4%, investigating rider allocation in Downtown during peak hours.
""",
    (STATUS_COLS, [
        ["Priya Nair", "Renegotiate delivery-partner SLA for Downtown zone", "2026-10-05", "In Progress", "2026-09-26", "", ""],
        ["Farah Al Mansoori", "Onboard 15 new restaurant partners in Sharjah", "2026-09-30", "In Progress", "2026-09-27", "", ""],
        ["Priya Nair", "Launch loyalty-points pilot in Dubai Marina (Eats side)", "2026-10-03", "Open", "2026-09-25", "", ""],
    ]))

write_unit(W, "wasla_mart",
    {"Dubai": [210000, 3.2, 4.1, 3850000, 14, 4.0, 4.5, 18500],
     "Abu Dhabi": [95000, 4.8, 4.6, 1620000, 7, 3.9, 4.5, 8200],
     "Sharjah": [61000, 9.1, 6.2, 980000, 4, 3.7, 4.5, 5100]},
    """
Overall a mixed week for Mart. Dubai continues to perform well and is close to hitting
our fulfillment targets, though Abu Dhabi and especially Sharjah are lagging on stockouts,
we think this is tied to the alerting issue Ahmed's team has been working through, more on
that in the open items below. Rating scores softened across all three clusters this week,
worth watching closely if it continues into next week.
""",
    (STATUS_COLS, [
        ["P. Nair", "Loyalty-points pilot data integration (Mart side)", "2026-10-02", "in progress", "2026-09-24", "", ""],
        ["Ahmed El-Sayed", STOCKOUT, "2026-09-19", "In Progress", "2026-09-20", "", ""],
        ["Ahmed El-Sayed", "Sharjah replenishment SOP rewrite", "2026-10-10", "Open", "2026-09-21", STOCKOUT, ""],
        ["Nadia Farouk", "Q4 inventory forecast model", "2026-10-12", "Open", "2026-09-18", STOCKOUT, ""],
        # Mart's non-standard vocabulary: lowercase "complete". Read as open,
        # this row would be overdue, stale and Flagship, a top-quadrant item.
        ["Nadia Farouk", "Dubai cluster picker-shift rota", "2026-09-24", "complete", "2026-09-19", "", ""],
    ]))

write_unit(W, "wasla_table",
    (TABLE_KPI, ["2026-09-27", 4200, 6.8, 11400, 890000, 4.6, 4.5, 1150]),
    """
Steady week, nothing major. No-shows ticked up slightly, lease renewal redlines still
pending with the landlord's side.
""",
    (TABLE_COLS, [
        ["Layla Haddad", f"{LEASE}, still waiting on redlines from landlord's counsel", "2026-09-29", "2026-09-27"],
        ["Reem Qassim", NPS, "2026-10-15", "2026-09-19"],
        ["Reem Qassim", "Reservation no-show fee rollout, resolved, live since last week", "2026-09-20", "2026-09-21"],
    ]))

write_unit(W, "wasla_express",
    (EXPRESS_KPI, [1240, 52, 38, "", 3.2, 4.3, 6]),   # gmv_aed blank: the missing-field week
    """
Huge momentum this week on the mall-retail integration, partner interest is off the
charts and we think we're on the verge of a big unlock once testing wraps. Also still
waiting to hear back on the partner-tier commission change, hoping to get that unblocked
soon so we can move on pricing.
""",
    (STATUS_COLS, [
        ["Zayd", "Waiting on CEO sign-off on partner-tier commission change, submitted memo for review", "end of this week", "Pending Decision", "2026-09-22", "", "confirm/reject"],
        ["Mina", MALL, "next Tuesday", "In Progress", "2026-09-14", "", ""],
        ["Rahul Mehta", "Renegotiate partner store commission floor", "in 2 weeks", "Open", "2026-09-23", "", ""],
    ]))

write_unit(W, "wasla_pay",
    (PAY_KPI, ["2026-09-27", 310000, 45, 8900, 0.6, 1, 4.2, 4.3, 2200]),
    """
TPV in line with forecast at AED 310K transactions processed. Dispute rate within
threshold at 0.6%. One compliance flag remains under review with Central Legal (see
action item). CSAT holding steady, marginally below internal target.
""",
    (PAY_COLS, [
        ["Layla Haddad", "Finalize compliance amendment for updated licensing terms", "2026-09-29", "Open", "TRUE", "2026-09-26", "", ""],
        ["Raj Mehta", "Dispute-resolution SLA renegotiation with acquiring bank", "2026-10-20", "In Progress", "FALSE", "2026-09-25", "", ""],
        # Due more than 3 days out so the pending clock is the only urgency signal.
        ["Nadia Osman", "Wallet KYC flow, waiting on Central Legal review", "2026-10-08", "Pending Decision", "FALSE", "2026-09-25", "Central Legal review", "confirm/reject"],
    ]))

write_unit(W, "wasla_central",
    (CENTRAL_KPI, [6, 11, 3, 4]),
    """
Legal: compliance amendment for Pay and lease redlines for Table both active this week,
same reviewer on both, flagging bandwidth. Design: roadmap workshop still needs a date.
IR: Q3 board deck refresh underway, due end of week. Tech/Product: no major updates.
Growth: loyalty-points pilot spanning Eats and Mart in final integration, same lead
coordinating both sides, on track for both due dates.
""",
    (STATUS_COLS, [
        ["Layla Haddad", "Update group-wide data-processing agreement template", "2026-11-01", "In Progress", "2026-09-20", "", ""],
        ["Omar Siddiqui", WORKSHOP, "", "In Progress", "2026-09-15", "", ""],
        ["Omar Siddiqui", "Investor deck refresh for Q3 board meeting", "2026-09-30", "Open", "2026-09-26", "", ""],
    ]))


# ======================================================================
# Week 2, ending 2026-10-04 (scored 2026-10-05)
# ======================================================================
W = "2026-10-04"
write_unit(W, "wasla_eats",
    (EATS_KPI, ["2026-10-04", 86200, 6300000, 91.9, 3135, 18.5, 4.4, 4.5, 53100]),
    """
- GMV up 2% WoW.
- Marina loyalty pilot live on both Eats and Mart sides, early redemption rate 11%.
- Sharjah expansion budget memo is with the CEO, three options.
""",
    (STATUS_COLS, [
        ["Priya Nair", "Renegotiate delivery-partner SLA for Downtown zone", "2026-10-05", "Done", "2026-10-02", "", ""],
        ["Farah Al Mansoori", "Onboard 15 new restaurant partners in Sharjah", "2026-09-30", "Done", "2026-09-30", "", ""],
        ["Priya Nair", "Launch loyalty-points pilot in Dubai Marina (Eats side)", "2026-10-03", "Done", "2026-10-03", "", ""],
        ["Farah Al Mansoori", BUDGET, "2026-10-16", "Pending Decision", "2026-10-02", "", "select-option"],
    ]))

write_unit(W, "wasla_mart",
    {"Dubai": [212000, 3.1, 4.1, 3880000, 14, 4.0, 4.5, 18800],
     "Abu Dhabi": [96000, 5.2, 4.7, 1630000, 7, 3.9, 4.5, 8300],
     "Sharjah": [58000, 11.4, 6.6, 940000, 4, 3.5, 4.5, 5000]},
    """
Another mixed week. Dubai is steady. Sharjah stockouts got worse before they get better,
the alerting fix is still in progress and Ahmed expects a vendor patch soon. The SOP
rewrite and the forecast model are both waiting on that fix. Ratings dipped again in
Sharjah, which tracks with the stockouts.
""",
    (STATUS_COLS, [
        ["P. Nair", "Loyalty-points pilot data integration (Mart side)", "2026-10-02", "Done", "2026-10-02", "", ""],
        # Touched on 1 Oct, so no longer stale, but 16 days overdue.
        ["Ahmed El-Sayed", STOCKOUT, "2026-09-19", "In Progress", "2026-10-01", "", ""],
        # Blank status: Mart's vocabulary includes leaving it empty.
        ["Ahmed El-Sayed", "Sharjah replenishment SOP rewrite", "2026-10-10", "", "2026-09-21", STOCKOUT, ""],
        ["Nadia Farouk", "Q4 inventory forecast model", "2026-10-12", "Open", "2026-09-18", STOCKOUT, ""],
    ]))

write_unit(W, "wasla_table",
    # covers_seated left blank: Table's reporting is the least mature.
    (TABLE_KPI, ["2026-10-04", 4150, 7.1, "", 880000, 4.6, 4.5, 1180]),
    "Quiet week. Lease still stuck on the landlord's redlines.",
    (TABLE_COLS, [
        ["Layla Haddad", f"{LEASE}, still waiting on redlines from landlord's counsel", "2026-09-29", "2026-10-01"],
        ["Reem Qassim", NPS, "2026-10-15", "2026-09-19"],
    ]))

write_unit(W, "wasla_express",
    (EXPRESS_KPI, [1310, 50, 40, 98000, 3.4, 4.3, 8]),
    """
Incredible week! Mall-retail integration is basically there, partners are lining up and
testing wraps next week. Commission change approved and live, thank you!
""",
    (STATUS_COLS, [
        ["Zayd", "Waiting on CEO sign-off on partner-tier commission change, approved 29 Sep, rolled out", "end of this week", "Done", "2026-09-30", "", "confirm/reject"],
        # Untouched since 14 Sep. "next Tuesday" is re-read every week, so the
        # due date quietly rolls forward and the item never looks overdue.
        ["Mina", MALL, "next Tuesday", "In Progress", "2026-09-14", "", ""],
        ["Rahul Mehta", "Renegotiate partner store commission floor", "in 2 weeks", "Open", "2026-10-01", "", ""],
    ]))

write_unit(W, "wasla_pay",
    (PAY_KPI, ["2026-10-04", 314000, 45, 9100, 0.6, 1, 4.2, 4.3, 2250]),
    """
Compliance amendment filed ahead of the regulatory deadline. Dispute rate stable at 0.6%.
Wallet KYC flow remains with Central Legal; no change since last report.
""",
    (PAY_COLS, [
        ["Layla Haddad", "Finalize compliance amendment for updated licensing terms", "2026-09-29", "Done", "TRUE", "2026-09-29", "", ""],
        ["Raj Mehta", "Dispute-resolution SLA renegotiation with acquiring bank", "2026-10-20", "In Progress", "FALSE", "2026-10-02", "", ""],
        ["Nadia Osman", "Wallet KYC flow, waiting on Central Legal review", "2026-10-08", "Pending Decision", "FALSE", "2026-09-25", "Central Legal review", "confirm/reject"],
    ]))

write_unit(W, "wasla_central",
    (CENTRAL_KPI, [6, 12, 4, 4]),
    """
Legal: compliance amendment for Pay filed; lease redlines for Table still with the landlord.
Design: roadmap workshop still needs a date. IR: Q3 board deck delivered.
Tech/Product: no major updates. Growth: loyalty pilot live on Eats and Mart.
""",
    (STATUS_COLS, [
        ["Layla Haddad", "Update group-wide data-processing agreement template", "2026-11-01", "In Progress", "2026-10-02", "", ""],
        ["Omar Siddiqui", WORKSHOP, "", "In Progress", "2026-09-15", "", ""],
        ["Omar Siddiqui", "Investor deck refresh for Q3 board meeting", "2026-09-30", "Done", "2026-09-30", "", ""],
    ]))


# ======================================================================
# Week 3, ending 2026-10-11 (scored 2026-10-12)
# ======================================================================
W = "2026-10-11"
write_unit(W, "wasla_eats",
    (EATS_KPI, ["2026-10-11", 86100, 6290000, 92.8, 3150, 18.4, 4.5, 4.5, 54000]),
    """
- GMV flat WoW, Sharjah partner count now 27.
- Rider allocation fix in Downtown lifted on-time delivery to 92.8%.
- Still waiting on the Sharjah expansion budget decision.
""",
    (STATUS_COLS, [
        ["Farah Al Mansoori", BUDGET, "2026-10-16", "Pending Decision", "2026-10-02", "", "select-option"],
        ["Priya Nair", "Loyalty pilot Dubai-wide rollout plan", "2026-10-30", "Open", "2026-10-09", "", ""],
    ]))

write_unit(W, "wasla_mart",
    {"Dubai": [215000, 3.0, 4.0, 3920000, 14, 4.2, 4.5, 19000],
     "Abu Dhabi": [97500, 4.1, 4.5, 1650000, 7, 4.1, 4.5, 8400],
     "Sharjah": [62500, 6.3, 5.8, 1000000, 4, 3.9, 4.5, 5200]},
    """
Long week, but the headline is good: the Sharjah stockout alerting fix went live on 9 Oct
and stockout rates are already falling. The SOP rewrite restarted the next day with a new
date. The forecast model hasn't moved yet and its date has slipped a week. Ratings
recovered partway across all three clusters.
""",
    (STATUS_COLS, [
        ["Ahmed El-Sayed", STOCKOUT, "2026-09-19", "done", "2026-10-09", "", ""],
        ["Ahmed El-Sayed", "Sharjah replenishment SOP rewrite", "2026-10-24", "In Progress", "2026-10-10", STOCKOUT, ""],
        # Blocker is done, so the 24-day silence now counts as stale.
        ["Nadia Farouk", "Q4 inventory forecast model", "2026-10-19", "Open", "2026-09-18", STOCKOUT, ""],
    ]))

write_unit(W, "wasla_table",
    (TABLE_KPI, ["2026-10-11", 4280, 6.5, 11650, 905000, 4.5, 4.5, 1210]),
    "Redlines arrived, landlord wants an 8% uplift. Negotiating.",
    (TABLE_COLS, [
        ["Layla Haddad", f"{LEASE}, redlines received, still negotiating 8% rent uplift", "2026-09-29", "2026-10-09"],
        ["Reem Qassim", NPS, "2026-10-15", "2026-09-19"],
    ]))

write_unit(W, "wasla_express",
    # avg_delivery_time_min dropped entirely this week: Express's columns vary.
    (["orders", "partner_store_count", "gmv_aed", "delivery_rating_avg",
      "delivery_rating_target", "rated_deliveries_count"],
     [1420, 41, 104500, 3.6, 4.3, 9]),
    """
Momentum keeps building. Mall-retail testing is in the final stretch, we expect to flip the
switch any day. Partner store count up again.
""",
    (STATUS_COLS, [
        ["Mina", MALL, "next Tuesday", "In Progress", "2026-09-14", "", ""],
        ["Rahul Mehta", "Renegotiate partner store commission floor", "in 2 weeks", "Done", "2026-10-08", "", ""],
    ]))

write_unit(W, "wasla_pay",
    (PAY_KPI, ["2026-10-11", 318500, 45, 9350, 0.6, 0, 4.3, 4.3, 2300]),
    """
KYC flow approved by Central Legal and live on 8 Oct. Acquiring-bank contract extension
submitted for CEO approval. CSAT at target.
""",
    (PAY_COLS, [
        ["Raj Mehta", "Dispute-resolution SLA renegotiation with acquiring bank", "2026-10-20", "In Progress", "FALSE", "2026-10-09", "", ""],
        ["Nadia Osman", "Wallet KYC flow, Legal approved, live", "2026-10-08", "Done", "FALSE", "2026-10-08", "", "confirm/reject"],
        ["Raj Mehta", EXTEND, "2026-10-23", "Pending Decision", "FALSE", "2026-10-08", "", "confirm/reject"],
    ]))

write_unit(W, "wasla_central",
    (CENTRAL_KPI, [5, 10, 5, 5]),
    """
Legal: data-processing agreement template in progress. Design: roadmap workshop set for 22 Oct.
IR: preparing the Q3 results call. Tech/Product: no major updates.
Growth: planning the Dubai-wide loyalty rollout.
""",
    (STATUS_COLS, [
        ["Layla Haddad", "Update group-wide data-processing agreement template", "2026-11-01", "In Progress", "2026-10-09", "", ""],
        ["Omar Siddiqui", WORKSHOP, "2026-10-22", "In Progress", "2026-10-09", "", ""],
    ]))


# ======================================================================
# Week 4, ending 2026-10-18 (scored 2026-10-19). The landing page.
# ======================================================================
W = "2026-10-18"
write_unit(W, "wasla_eats",
    (EATS_KPI, ["2026-10-18", 88700, 6480000, 92.6, 3162, 18.5, 4.4, 4.5, 55200]),
    """
- GMV up 3% WoW.
- Loyalty pilot Dubai-wide rollout plan in draft.
- Sharjah expansion budget decision still pending, hiring plan on hold until then.
""",
    (STATUS_COLS, [
        ["Farah Al Mansoori", BUDGET, "2026-10-16", "Pending Decision", "2026-10-02", "", "select-option"],
        ["Priya Nair", "Loyalty pilot Dubai-wide rollout plan", "2026-10-30", "Open", "2026-10-09", "", ""],
        # A spelling the alias table has never seen. It is Layla Haddad, and
        # resolving it would reveal a clash with her board pack review.
        ["L. Haddad", "Review rider-fleet vendor master services agreement", "2026-10-21", "Open", "2026-10-16", "", ""],
    ]))

write_unit(W, "wasla_mart",
    {"Dubai": [218000, 2.9, 4.0, 3960000, 14, 4.4, 4.5, 19200],
     "Abu Dhabi": [99000, 3.4, 4.3, 1680000, 7, 4.3, 4.5, 8500],
     "Sharjah": [66000, 3.3, 4.9, 1060000, 4, 4.2, 4.5, 5400]},
    """
Sharjah stockout rates are back in line with Dubai. The SOP rewrite is done. Ratings are
close to target in all three clusters for the first time this quarter, and the forecast
model is being finalised.
""",
    (STATUS_COLS, [
        ["Ahmed El-Sayed", "Sharjah replenishment SOP rewrite", "2026-10-24", "Done", "2026-10-17", STOCKOUT, ""],
        ["Nadia Farouk", "Q4 inventory forecast model", "2026-10-19", "In Progress", "2026-10-15", STOCKOUT, ""],
    ]))

write_unit(W, "wasla_table",
    (TABLE_KPI, ["2026-10-18", 4390, 6.2, 11900, 921000, 4.6, 4.5, 1195]),
    "Lease countersigned on 14 Oct. Brunch campaign in planning.",
    (TABLE_COLS, [
        ["Layla Haddad", f"{LEASE}, countersigned 14 Oct, resolved", "2026-09-29", "2026-10-14"],
        # The NPS survey row is gone: deleted from the tracker, never marked done.
        ["Reem Qassim", "Weekend brunch covers campaign", "2026-10-25", "2026-10-16"],
    ]))

write_unit(W, "wasla_express",
    (EXPRESS_KPI, [1580, 49, 43, 118000, 3.8, 4.3, 15]),
    """
Big week coming. Mall-retail testing wraps next week, and we're already lining up the first
10 stores to onboard. Ratings are a bit soft while we scale, nothing structural.
""",
    (STATUS_COLS, [
        ["Mina", MALL, "next Tuesday", "In Progress", "2026-09-14", "", ""],
        ["Zayd", "Onboard 10 mall-retail partner stores", "2026-10-31", "Open", "2026-10-16",
         "Mall-retail partner integration testing", ""],
    ]))

write_unit(W, "wasla_pay",
    (PAY_KPI, ["2026-10-18", 322000, 46, 9600, 0.5, 0, 4.3, 4.3, 2280]),
    """
Acquiring-bank contract extension awaiting CEO approval; current term ends 31 Oct.
Dispute-resolution SLA renegotiation on track for 20 Oct.
""",
    (PAY_COLS, [
        ["Raj Mehta", "Dispute-resolution SLA renegotiation with acquiring bank", "2026-10-20", "In Progress", "FALSE", "2026-10-16", "", ""],
        ["Raj Mehta", EXTEND, "2026-10-23", "Pending Decision", "FALSE", "2026-10-08", "", "confirm/reject"],
    ]))

write_unit(W, "wasla_central",
    (CENTRAL_KPI, [6, 9, 6, 5]),
    """
Legal: board pack review due 20 Oct; the rider-fleet vendor agreement for Eats is also in
the queue. Design: roadmap workshop on 22 Oct. IR: Q3 results call prep due 22 Oct, same
day as the workshop. Tech/Product: no major updates. Growth: rollout plan in draft.
""",
    (STATUS_COLS, [
        ["Layla Haddad", "Update group-wide data-processing agreement template", "2026-11-01", "In Progress", "2026-10-16", "", ""],
        ["Layla Haddad", "Board pack legal review", "2026-10-20", "Open", "2026-10-15", "", ""],
        ["Omar Siddiqui", WORKSHOP, "2026-10-22", "In Progress", "2026-10-16", "", ""],
        ["Omar Siddiqui", "Investor Q&A prep for Q3 results call", "2026-10-22", "Open", "2026-10-15", "", ""],
    ]))


# ======================================================================
# Alias table: shared across weeks. The offline, human-reviewed output of the
# one-time alias step. "L. Haddad" (week 4) is deliberately NOT in it yet.
# ======================================================================
write_csv(
    os.path.join(ROOT, "alias_table.csv"),
    ["raw_name", "unit", "normalized_owner", "review_note"],
    [
        ["Priya Nair", "Wasla Eats", "Priya Nair",
         "canonical form; Central growth/loyalty lead, listed against an Eats-side task on the joint loyalty pilot"],
        ["P. Nair", "Wasla Mart", "Priya Nair",
         "fuzzy-match candidate, confirmed same person during offline review; same Central growth/loyalty lead, Mart-side of the same pilot"],
        ["Rahul Mehta", "Wasla Express", "Rahul Mehta", "canonical form"],
        ["Raj Mehta", "Wasla Pay", "Raj Mehta",
         "fuzzy-match candidate, confirmed DIFFERENT person during offline review, not merged"],
        ["Ahmed El-Sayed", "Wasla Mart", "Ahmed El-Sayed", "canonical form"],
        ["Nadia Farouk", "Wasla Mart", "Nadia Farouk", "canonical form"],
        ["Farah Al Mansoori", "Wasla Eats", "Farah Al Mansoori", "canonical form"],
        ["Layla Haddad", "Wasla Central", "Layla Haddad",
         "canonical form; appears as owner across Table, Pay, and Central"],
        ["Omar Siddiqui", "Wasla Central", "Omar Siddiqui", "canonical form"],
        ["Reem Qassim", "Wasla Table", "Reem Qassim", "canonical form"],
        ["Zayd", "Wasla Express", "Zayd", "first-name-only per Express's convention, no ambiguity found"],
        ["Mina", "Wasla Express", "Mina", "first-name-only per Express's convention, no ambiguity found"],
        ["Nadia Osman", "Wasla Pay", "Nadia Osman",
         "canonical form, distinct from Nadia Farouk (Mart), different surname, not merged"],
    ],
)

# Remove the v1 single-week layout if it's still there.
for unit in ("wasla_eats", "wasla_mart", "wasla_table", "wasla_express", "wasla_pay", "wasla_central"):
    old = os.path.join(ROOT, unit)
    if os.path.isdir(old):
        shutil.rmtree(old)

print("done:", os.path.abspath(ROOT))
