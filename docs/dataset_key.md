# Dataset key

Four weekly snapshots: week ending 2026-09-27, 10-04, 10-11 and 10-18, each scored as of the Monday after (09-28, 10-05, 10-12, 10-19). Every area sends the same template (docs/data_contract.md section 3).
Every scenario below is a deliberately designed row, not randomized data, so this key doubles as a test plan, each line is a case the engine should get right. Week 1 is tested in `tests/scenarios.test.js`, weeks 2 to 4 in `tests/history.test.js`.

## Week 1, ending 2026-09-27

Reference "today" for all day-counts in this section: 2026-09-28.

### Conflicts (same normalized owner, overlapping due-date window)

- **Layla Haddad**: Wasla Table's lease renewal (due 2026-09-29) and Wasla Pay's compliance amendment (due 2026-09-29). Same day, unambiguous, no alias resolution needed.
- **Priya Nair / P. Nair**: Wasla Eats' loyalty-points item (due 2026-10-03) and Wasla Mart's loyalty-points item (due 2026-10-02), one day apart. Priya is Central's growth/loyalty lead, not an Eats or Mart hire, she's coordinating one joint pilot across both areas, same structural reason Layla Haddad spans Table and Pay. This one only surfaces as a conflict if the alias table correctly merges "P. Nair" (Mart's shorthand) into "Priya Nair", miss the merge, miss the conflict, this is the row that proves alias resolution matters, not just tidies data.

### Alias resolution, both directions

- True positive: "P. Nair" (Mart) merges to "Priya Nair" (Eats), see above.
- False-positive trap: "Rahul Mehta" (Express) and "Raj Mehta" (Pay) are similar-looking names but different people. `alias_table.csv` records both as reviewed and explicitly not merged. If the engine (or a fuzzy-matcher) merges these, it invents a conflict that isn't real.

### Staleness

- **Wasla Mart, "Fix stockout alerting for Sharjah dark stores"**: due 2026-09-19 (9 days overdue), last touched 2026-09-20. Two other open items are blocked by it (the SOP rewrite and the Q4 forecast model), dependency fan-out = 2. Flagship area, overdue, high fan-out: this should land in the top-left quadrant, needs your decision now, even though it's a staleness flag, not a decision-pending one.
- **The two items blocked by the stockout fix** (SOP rewrite, last touched 7 days ago; Q4 forecast model, 10 days): both are past the staleness threshold by date, but neither should be flagged stale. They can't move until the blocker lands. Flagging them sends the reader after three people when one fix unblocks all three, so they're listed on the blocker's card instead.
- **Wasla Express, "Mall-retail partner integration testing"**: last touched 2026-09-14, 14 days untouched as of today, despite the task itself being written in present-tense, high-momentum language ("huge momentum, on the verge of a big unlock"). This is the deliberate trap: the wording should not be allowed to override what the last-updated date shows. If the engine trusts the prose over the timestamp, it misses this one.
- **Wasla Table, "Reservation no-show fee rollout"**: due 2026-09-20 (8 days overdue by the raw date), but its status was left blank, with the real state written in the task: "resolved, live since last week." Read from the text, it is done and should NOT be flagged stale. This is the counterpart trap to the Express row above, proving a blank status read from the text can suppress a false positive, not just catch a real one.

### Decision-pending

- **Wasla Express, Zayd's item**: "waiting on CEO sign-off," `waiting_on` CEO, pending since 2026-09-22, 6 days as of today, past the 5-day threshold. Waiting specifically on the principal, high importance by definition, high urgency. `decision_type` is Yes or no, low effort. This should be at or near the very top of the briefing, both highest quadrant and low-effort within it.
- **Wasla Pay, Nadia Osman's item**: `waiting_on` Central Legal, not the principal, pending only 3 days. Core tier area, no dependency fan-out. Due 2026-10-08, more than 3 days out, so the pending clock is the only urgency signal in play. Low importance, low urgency, correctly belongs in the omit quadrant, not the briefing. (Originally due 2026-10-01, exactly 3 days out, which tripped the due-within-3-days rule and contradicted this row's intended outcome. Moved.)

### No due date

- **Wasla Central, "Q4 product roadmap prioritization workshop"**: no due date at all. Should be flagged "needs a deadline set," not scored as zero urgency and ignored.

### Metrics (against the targets in setup, single week)

- **Every business reports the metrics set for it**: Eats orders, on-time delivery and rating; Mart sales (per city, added up) and rating (per city, averaged by count); Table reservations and rating; Express orders and rating; Pay transactions, dispute rate and rating; Central roadmap items shipped. Every metric other than the ratings below is met every week, so only the ratings move a quadrant.

### Customer rating (0.2-point margin, floor of 10 ratings)

- **Wasla Mart**: reports its rating per city, three rows with `segment` Dubai, Abu Dhabi and Sharjah. Blended, weighted by `count`, it is roughly 3.93 against a 4.5 target. A real miss, should trigger. Sharjah (3.7, worst of the three) also lines up narratively with the stockout item above, same underlying problem showing up two ways.
- **Wasla Eats**: 4.4 vs. 4.5, a 0.1 miss. Should NOT trigger, this is the "small miss, within tolerance" case.
- **Wasla Pay**: 4.2 vs. 4.3, also a 0.1 miss, same non-trigger logic as Eats, a second example so the tolerance isn't a one-off.
- **Wasla Express**: 3.2 vs. 4.3 looks like the worst miss in the dataset, but `count` is only 6, below the 10-rating floor. Should NOT trigger, on volume grounds, not because the number looks fine, it doesn't.
- **Mart's miss moves no quadrant in week 1**: a triggered area lifts importance for its own flagged items, but Mart is already Flagship. `tests/scenarios.test.js` proves the lift on a modified copy where Wasla Table misses its target, and week 4 shows it in the real data, on Wasla Express.

### The template

- Every area sends tasks.csv and metrics.csv in the same columns.
- Decisions name who they wait on in `waiting_on`: the CEO for Zayd's, Central Legal for Nadia Osman's.
- Every area in the files is one of the six in setup.

## Week 2, ending 2026-10-04 (scored 2026-10-05)

- **Closed as done**: Zayd's commission decision (the CEO signed off), both sides of Priya's loyalty pilot, and Layla's Pay compliance amendment. Four of the week-1 flags resolved, which is the loop working.
- **Wasla Mart, stockout fix**: touched on 1 Oct, so no longer stale, but 16 days overdue. Before the overdue rule existed, this is where it fell off the briefing entirely. With it, the item stays at the top, 2nd week running. The two items it blocks stay listed on its card.
- **Wasla Table, lease renewal**: was a conflict in week 1 (Layla chose to file Pay's regulatory amendment first). Now 6 days overdue. Same item, different flag: it reads as 2nd week running, not new. Proves carry-over follows the item, not the flag.
- **Wasla Express, mall-retail testing**: still untouched since 14 Sep. Its due date is written "next Tuesday" every week, so it rolls forward on its own and never looks overdue. The card shows the date moving: 29 Sep, 6 Oct.
- **Wasla Pay, Nadia Osman's KYC decision**: omitted in week 1 at 3 days pending. At 10 days it becomes urgent and moves up to "flag, don't escalate". Not labelled stale: a decision's wait isn't the owner's neglect.
- **Tier order in "flag, don't escalate"**: Layla's lease, then Nadia Osman's decision, then Mina's mall-retail item. Mina's item is due sooner than Nadia's, but Express is Experimental and Pay is Core, and Core sits above Experimental inside a group.
- **Wasla Eats, Sharjah expansion budget**: new decision waiting on the CEO, three options (Pick an option, Medium effort). Pending 3 days, so "on your radar", marked new.
- **Wasla Mart, SOP rewrite**: status left blank. Read from the task text as open. Still blocked, so not flagged.
- **Wasla Central, data-processing template**: updated 2 Oct, so it clears. Closed as "cleared", with the update date as the reason.

## Week 3, ending 2026-10-11 (scored 2026-10-12)

- **Wasla Mart, stockout fix**: marked done on 9 Oct. Closed as done after 2 weeks flagged.
- **Wasla Mart, Q4 forecast model**: with its blocker done, its 24-day silence now counts. Flagged new, stale, "on your radar". Its due date also moved from 12 Oct to 19 Oct, shown on the card. The SOP rewrite, also unblocked, was touched on 10 Oct and stays off the briefing.
- **Wasla Central, roadmap workshop**: finally has a date, 22 Oct. Closed as cleared, "deadline set for 22 Oct".
- **Wasla Pay, Nadia Osman's KYC decision**: approved by Legal. Closed as done.
- **Wasla Eats, expansion budget**: pending 10 days, now urgent. Moves to "needs decision now", 2nd week running.
- **Wasla Pay, acquiring-bank contract extension**: new decision waiting on the CEO, Yes or no. Pending 4 days, so "on your radar".
- **Wasla Table, lease** (13 days overdue) and **NPS survey** (23 days untouched): both 3rd week running.
- **Wasla Express, mall-retail testing**: 3rd week running, due date moved again to 13 Oct. Rating 3.6 against 4.3, but only 9 rated deliveries, still under the floor.

## Week 4, ending 2026-10-18 (scored 2026-10-19). The landing page

- **Top quadrant order**: Raj's contract extension (Yes or no, Low effort, 2nd week) above Farah's expansion budget (Pick an option, Medium effort, 3rd week, now overdue), even though Farah has waited longer. Then Mina's item. Two of the three are waiting on the CEO personally.
- **Wasla Express, mall-retail testing**: 4th week running, untouched for 35 days, due date moved four times (29 Sep, 6 Oct, 13 Oct, 20 Oct). Express clears the 10-rating floor for the first time (15 ratings) and misses its target by 0.5. That lifts an Experimental area's item into "needs decision now": the rating signal changing a quadrant in the shipped data. The task still says "huge momentum". A new onboarding item names it as a blocker by title only.
- **Wasla Table, NPS survey**: deleted from the tracker after 3 weeks flagged, never marked done. Closed as "removed, not done".
- **Wasla Table, lease**: countersigned 14 Oct. Closed as done after 3 weeks flagged.
- **Wasla Mart, forecast model**: updated 15 Oct. Closed as cleared. Mart's rating recovers to 4.34 against 4.5, within tolerance; last week's miss shows beside it.
- **Wasla Central, roadmap workshop**: flagged in weeks 1 and 2, clear in week 3, back in week 4 in a same-day clash with Omar's Q3 results-call prep. Marked "back, last flagged 4 Oct"; the results-call prep is new.
- **Wasla Eats, Dubai-wide loyalty rollout plan**: untouched 10 days. New, stale, "on your radar".
- **"L. Haddad" on an Eats vendor agreement**: a spelling the alias table has never seen. Reported at the top of the page. It is Layla Haddad: adding the row to the alias table reveals a clash with her board pack review (due 20 Oct vs 21 Oct), and the Eats item, Flagship and due in 2 days, goes straight to "needs decision now". Until someone reviews the table, that clash is invisible. The shipped owner table deliberately leaves the row out.

