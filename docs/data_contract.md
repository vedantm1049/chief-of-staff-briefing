# Chief of Staff Briefing, Data Contract

Working spec. Fictional scenario, real deterministic engine, same posture as `scan`: not in production, not pretending to be.

## 1. Fictional structure

**Wasla Group**, a fictional Dubai-based multi-vertical super-app holding company. Business-line mix modeled on the real shape of regional aggregators (Talabat, noon, Careem), not on any single real company's actual internals or figures.

**Principal:** Group CEO. The briefing is what a Chief of Staff prepares for the Group CEO every week. "Wasla" is a placeholder name, swap freely.

## 2. The example's five businesses

The example calls its areas businesses. A user's own setup names its areas and what kind they are (departments, businesses, brands, markets). The example's structure follows a real setup made on the page, with every name, email, product and number changed.

| Business | What it does | Tier |
|---|---|---|
| Wasla Minutes | Quick-commerce delivery in minutes | Flagship |
| Wasla.com | The marketplace | Core |
| Wasla Food | Food delivery | Core |
| Wasla Labs | New ventures: Wasla Wash, Wasla Business, pilots | Experimental |
| Wasla Central | Investor relations, legal, the CEO's office, brand, finance | Core |

1 Flagship, 3 Core, 1 Experimental. Central's staff own work that other businesses wait on: the brand team's campaign holds up the Wasla Wash branding, the people team's visa block holds up hiring for Minutes.

## 3. Setup, tasks and metrics

**Setup**, made on the page: the company, the boss's title, what areas are called, and each area with its tier, its leader (name, email) and the metrics it reports. A metric is a name, a unit, a weekly target, whether higher or lower is better, a margin (percent of target, or points) and, for numbers that rest on responses, a minimum count. The example's setup is `WASLA_SETUP` in `app/engine/config.js`.

**Tasks**, one row per task, in these columns wherever they come from (kept on the page, a person's returned sheet, or the example's `tasks.csv`):

| Column | Meaning |
|---|---|
| `id` | set for tasks kept on the page; identifies the task across weeks through any edit |
| `area` | the area, as named in setup (matched without regard to case) |
| `task` | the task. Without an id, its title (the text before the first comma) identifies it across weeks |
| `owner` | who owns it; other spellings are matched to people by the owner table |
| `due_date` | ISO date, or free text the engine can read ("next Tuesday", "end of next week", "in 2 weeks"), or blank |
| `status` | Open, In progress, Waiting on decision, or Done. Blank is read from the task text |
| `waiting_on` | for a decision, who it waits on. Matching the boss's title makes it waiting on the boss |
| `blocked_by` | the id of another tracked task this one waits for, or, for data without ids, its title or full text |
| `moves_metric` | optional: the one of its area's metrics this task is meant to move. Set on the Tasks screen |
| `decision_type` | Yes or no (Low effort), Pick an option (Medium), Open question (High) |
| `last_updated` | ISO date of the last real change |
| `decision`, `decided_on` | the boss's answer as recorded on the page, and its date. Not in people's sheets |

**Metrics**, one row per metric per week: `area`, `metric`, `segment`, `value`, `target`, `count`. Several rows for one metric (cities, stores) combine the way the metric says in setup: added up (sales, orders) or averaged (ratings, percentages, times), weighted by count when every row has one. Suggested metrics come with the right choice; one typed in defaults to averaging when its unit is %, out of 5 or points, or its name reads like a rate, score or time. A target on a row is used over the setup target; a leader's returned sheet never supplies one.

**The weekly sheets.** Each area leader gets an Excel sheet listing their area's metrics with a value column to fill; the same sheet serves every week. Each person gets an Excel sheet of their open tasks, made fresh each week. A returned person's sheet is compared with the page before anything changes: a changed row counts as touched on the day it is uploaded, unless it gives a later last-updated date; a new row is a new task; a missing row is removed, and if it was flagged it shows as removed, not done.

**The people list**: each person, their email and area, and any other spelling of their name that has been confirmed.

## 4. What a fixed format doesn't clean up

A fixed format fixes the shape of the files, not what people type into them. The example keeps the quirks that survive any template:

- Owner names written differently: "P. Nair" for Priya Nair, first names only at Express, and in week 4 a spelling ("L. Haddad") the owner table has never seen
- Two similar names that are different people ("Rahul Mehta", "Raj Mehta")
- Due dates written as free text ("next Tuesday", "end of this week", "in 2 weeks") or left blank
- A status left blank, with the real state written in the task ("resolved, live since last week")
- Upbeat wording on a task nobody has touched ("huge momentum, on the verge of a big unlock")
- Metrics reported per city by one area and as one number by the others

## 5. Scoring recap

Decisions already locked, restated here for one place to check them:

- Detection rules: staleness, overdue, conflict (same normalized owner, overlapping date windows), decision-pending (closed trigger-phrase vocabulary), each a boolean rule against stated fields. An open item waiting on another open tracked item is blocked, neither stale nor overdue, and is listed on its blocker instead. A pending decision is never called stale: its wait is measured by its own pending clock
- Items with no usable due date (blank, or free text the engine can't read, like "TBD") are flagged "needs a deadline set," not scored as zero urgency
- Classification: importance x urgency 2x2 grid. Importance from area priority tier, decision-pending-on-principal flag, dependency fan-out (2+ open items held up by this one, counting the whole chain behind it), or a link to a metric its area missed this week. Urgency from overdue days, due-within-3-days, or pending-5+-days
- Effort sort (Low/Medium/High from the `decision_type` column) applies only inside the "needs your decision now" quadrant, only to decision-pending items
- Tier order: only Flagship lifts importance, but inside every quadrant items are ordered Flagship, then Core, then Experimental, then most overdue first. In the top quadrant, decision-pending items still come first by effort, with tier breaking ties
- Waiting on the principal: a decision whose `waiting_on` names the boss's title from setup (whole words, any case), or whose task text does. "CEO" in the example
- A third importance signal: a metric misses its own target by more than its margin this week, in the direction that counts as good, and the task is linked to that metric (`moves_metric`). A miss no longer lifts every task in the area. Single week only, not a trend. A metric with a minimum count is only judged on at least that many responses, so a low-volume week doesn't trigger on noise. In the example, customer ratings use 0.2 points and 10 ratings, the floor cafe-qc uses; the other metrics use margins of a few percent and are always met, so only the ratings move a quadrant
- Owner names are matched only by a person. In the example, the owner table was reviewed by hand while building the dataset. In a user's own setup, each new spelling in an uploaded file prompts "is this the same person as ...?" before the week can be saved. The engine never fuzzy-matches and never calls an AI model. A name the table has never seen is reported in the briefing, not guessed at, since a new shorthand could hide a conflict
- An area name in the files that isn't in setup is reported at the top of the briefing; its items are scored as Core. On upload, the reader is asked which area it is first

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

Rebuilt for use on a real company:

- **One template for every area.** The example no longer sends six different formats. Every area sends tasks.csv and, if it has customers, metrics.csv, in the columns of section 3. Gone from the example: the multi-tab Excel KPI export, the per-area KPI columns, the free-text status updates (never scored), Table's missing status column, Pay's `regulatory_deadline`, Mart's mixed status words and the columns that came and went. The rules that handled them stay and keep their edge-case tests. The quirks people type into any template stay (section 4). Every dataset-key story survives except those that only tested a file format.
- **`waiting_on` column.** A decision says who it waits on. Matching the boss's title there counts as waiting on the principal, as the phrase in the task text still does. Nadia Osman's decision moves "Central Legal" from `blocked_by` to `waiting_on`, where it belongs: `blocked_by` now only names tracked tasks.
- **The boss's title comes from setup.** "CEO" is no longer fixed in the rules.
- **Decision types in plain words**: Yes or no, Pick an option, Open question. The older labels still read.
- **Customer rating as a metric row**, named Customer rating, with segments blended by count. Replaces the per-area rating column names.
- **Areas outside setup are reported**, not silently scored.
- **Setup for your own company**, on the page: areas and tiers, the boss's title, what areas are called, owners and emails, a template to download, uploads of the template or any CSV, Excel or pasted table with columns matched once and remembered, and a question for every new name or unknown area. Kept in the reader's browser with the rest, and in the backup.

Rebuilt so the Chief of Staff sets everything up in the browser:

- **Every area has a leader** (name and email) and **its own metrics**, chosen on the page from a fixed list of common ones or typed in, each with a weekly target, a direction and a margin.
- **One metric rule for every metric** replaces the customer-rating rule. The rating keeps its old behaviour as a metric with a 0.2-point margin and a floor of 10 ratings. The example's six businesses now report their real numbers (orders, sales, reservations, transactions, dispute rate, roadmap items shipped) with targets they meet every week, so the dataset key's stories are unchanged.
- **Tasks are kept on the page**, per person, not in files. Each task has an id, which becomes its identity across weeks, so it can be renamed or reassigned without losing its history. The example, which has no ids, still uses area plus title.
- **Weekly sheets and requests.** Each leader gets a metrics sheet and each person a tasks sheet (Excel), with an email draft each, due Wednesday, and a recurring Monday calendar reminder for all of them. Returned sheets are uploaded together and checked before they change anything. The page sends nothing itself.
- **Weeks.** Starting a new week freezes the week before as it stood, and drops tasks already done from the live list.
- Removed: uploading files in a team's own format with column matching. It solved a problem this flow no longer has.

The example rebuilt on a real setup:

- **The example is a whole company**, `data/example.json`, in the same shape the page keeps a reader's own, written by `scripts/generate_example.py`. It replaces the six Wasla units, their per-unit files and the hand-reviewed alias table. Visitors can click through every screen and change it; it resets to the original.
- **Its structure follows a real Chief of Staff's setup**, anonymised: five businesses, their leaders and metrics, and tasks that wait on each other in a chain. Four weeks of weekly numbers and task changes are made up to show each rule. docs/dataset_key.md is rewritten for it.
- **The file-based example's stories that depended on files** (a status word a unit invented, an unseen owner spelling in an upload) are gone from the example; the rules that handle them keep their tests in rules.test.js.
- **Edits scoped to one week are gone.** Ticking a task done or changing its date changes the task itself, in the current week.
- **The card of a blocking item shows the whole chain behind it.** Importance still counts only the items it holds up directly.
- **Fan-out counts the whole chain.** An item that holds up another, which holds up a third, holds up two. Before, only the items waiting on it directly counted. A chain that loops back never counts the item itself. In the example this makes the Wasla Wash branding important in week 3, where it holds up the launch and, behind it, the Wasla Business prototype: it moves from "flag, don't escalate" to "needs decision now".
- **Google Sheets by link.** A leader's metrics sheet or a person's tasks sheet can live in Google Sheets, published to the web as CSV. Its link goes in setup (per area) or on the Tasks screen (per person); only publish-to-web links are accepted, and the page says plainly that publishing makes the sheet readable by anyone with the link. "Fetch linked sheets" on This week reads each one; what comes back is checked and applied exactly like an uploaded file. Nothing is sent to Google except the request for the sheet.
- **The boss's answer, recorded.** A decision waiting on the boss no longer offers "mark done". Its card offers the boss's possible answers: for a yes or no, "Yes, go ahead", "No" with an optional reason, or "Ask a question"; for a choice or an open question, the answer in words. The page records the answer and its date in two new task fields, `decision` and `decided_on`; it decides nothing. Yes or a choice: no longer waiting on anyone, the task stays open (In progress) for the owner to carry out. No: the task closes with the reason. A question: it is kept as a note from the CEO and the task waits on the owner (`waiting_on` becomes their name) until their answer is added, when it goes back to the boss. Each answer offers an email draft to the owner.
- **`waiting_on`, when filled in, settles who a decision waits on**, whatever the task's wording says. Before, a task saying "for the CEO" counted as waiting on the CEO even with someone else in `waiting_on`.
- **Decided, in the week's history.** A decision that leaves the briefing because the boss answered closes as "Decided", with the answer and its date, not "Done" or "Cleared". In the example, the visa block (week 2), the ice-cream campaign and the office move (week 3).
- A leader's upload preview says when a number that needs a count (a customer rating) came without one.
- Notes and email drafts call the boss by the title in setup ("From the Managing Director: ..."), not always "CEO". A note stores who it is from as a role, the boss or the Chief of Staff; notes saved as "CEO" read as the boss.

After an outside review:

- **A metric miss lifts only the tasks linked to that metric.** Before, a miss made every flagged task in the area important, which overstated it: a business missing its rating does not make its unrelated work strategic. A task can now name the metric it is meant to move (`moves_metric`, set on the Tasks screen); only those tasks are lifted. In the example, the rider app is linked to Food's rating and the rider agency contract to Minutes' delivery time; the dataset key's outcomes are unchanged, and Food's menu review is shown not to be lifted.
- **Blocked by stores a task id.** On the Tasks screen it is picked as "Title (Owner)" and saved as the task's id, so renaming a task never breaks what waits on it and two tasks with the same title can be told apart. People's sheets still show the title and are read back to the id. Title matching remains for data without ids.
- **"Conflict" is called "two deadlines a day apart".** The rule only knows two due dates are close, not that the person is overloaded; the page now says only what it knows.
- **The CEO view is shorter.** Explanations moved into one "How this page decides" section at the foot; metrics show what needs attention first with the rest folded away; empty groups take one line.
- **Tests run on GitHub** on every push, and check the example file is exactly what its generator writes.
- **Progress on the page.** The CEO view says who has sent their numbers and task updates for the week shown ("numbers from 4 of 5 businesses, waiting on Wasla Labs"). This week can go through every request still to send, one draft at a time, with that person's sheet beside it. A new company's screens show a short checklist until something has come back.
- **Rows of one metric combine by the metric, not by which columns are filled.** Before, rows without counts were always added up, so two cities at 90% and 80% on-time read as 170%, and rows with counts were always averaged, so orders sent per city with a count were averaged instead of added. Each metric now says how its rows combine (`combine`: add up or average), set in setup, with the suggested metrics carrying the right choice. The example's results are unchanged: its sales add up and its ratings average by count.
