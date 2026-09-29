# Chief of Staff Briefing

A weekly briefing a Chief of Staff runs for their own company, all in the browser. Set up the company's areas, who leads each, the numbers each one reports and who owns what work. Each week the page asks the leaders for their numbers and people for their task updates, and turns what comes back into one view for the CEO: metrics against target, and only the work that needs them. It flags. It never resolves, reassigns, decides or suggests.

**Open it: https://vedantm1049.github.io/chief-of-staff-briefing/**

It runs in your browser. There is no server and no account, and nothing you enter leaves your computer.

## Use it for your company

1. **Setup.** Your company, who the briefing is for (CEO, Managing Director, any title), what you call the parts of the company (departments, businesses, brands, markets), your own email, and each area: its leader and their email, how much it matters (Flagship, Core, Experimental), and the metrics it reports every week. Metrics come from a list of common ones (sales, orders, customer rating, on-time delivery, costs, churn and more) or your own, each with a weekly target, whether higher or lower is better, and how far off counts as a miss.
2. **People and tasks.** Everyone who owns work, their email and area, and their open tasks: due date, status, whether it waits on a decision and on whom, and what it is blocked by. All on the page, no spreadsheet. A name like one you already have gets "is this the same person as...?", never a guess.
3. **Every Monday, on This week.** Start the week. The page makes each leader's metrics sheet (their metrics, a column to fill) and each person's tasks sheet (their open tasks, to update), both Excel, and a ready email draft for each, due Wednesday, opened in your own email app. A recurring Monday calendar reminder, set up once, invites everyone automatically.
4. **When sheets come back,** drop them all on the page. Each is checked and shown before anything changes: which numbers came in, which tasks were updated, added or removed. You can also change tasks yourself at any time.
5. **The CEO view.** Metrics against target with last week beside them, and flagged tasks sorted into four groups with the reasons on each card, plus what changed since last week. Tick an item done, change a due date, add a note from the CEO, draft an email to the owner (you are copied), and paste their reply back.

Everything is kept in the browser you use, until you export a backup. That is the price of nothing leaving your computer: to move to another laptop, export a backup and import it there. The page can't send email by itself; that would need a server.

## See it on an example first

The example is Wasla Group, a made-up Dubai holding company with six businesses, modeled on the mix of regional aggregators such as Talabat, noon and Careem, not on any one company's internals. Four weeks of task lists and metrics, ending 27 Sep to 18 Oct 2026. Every row was written by hand to test one rule. Over the four weeks decisions get made, work gets done, one item quietly disappears from a tracker, and one untouched item climbs to the top while its owner describes it as having "huge momentum". [`docs/dataset_key.md`](docs/dataset_key.md) walks through every case. Full spec: [`docs/data_contract.md`](docs/data_contract.md).

| Business | What it does | Tier | Metrics |
|---|---|---|---|
| Wasla Eats | Food delivery marketplace | Flagship | Orders, on-time delivery, customer rating |
| Wasla Mart | Dark-store grocery delivery | Flagship | Sales, customer rating (per city) |
| Wasla Table | Dine-out reservations and payments | Core | Reservations, customer rating |
| Wasla Express | 1 to 2 hour delivery from partner stores | Experimental | Orders, customer rating |
| Wasla Pay | Payments and wallet | Core | Transactions, dispute rate, customer rating |
| Wasla Central | Shared legal, design, investor relations, tech and growth | Core | Roadmap items shipped |

## What gets flagged

- **Overdue**: an open item past its due date.
- **Stale**: an open item untouched for 7 days or more. Only the last-updated date counts, never how the task is worded.
- **Conflict**: one person with two open items due within a day of each other, after their name spellings are matched.
- **Decision pending**: status says so, or the task uses one of a fixed list of phrases ("waiting on ... sign-off", "awaiting decision"). Split by whether it waits on the boss or on someone else. A decision's wait is measured by its own clock and never called stale.
- **No deadline**: no usable due date, blank or unreadable. Listed so a date gets set, not scored as "not urgent" and dropped.
- **Metric miss**: a metric is worse than its target by more than its margin, in the direction that counts as good. A number that rests on responses (a customer rating) is only judged on enough of them: the example uses 0.2 points and 10 ratings.

An item waiting on another open item is neither stale nor overdue in its own right. It is listed on its blocker's card, so the briefing points at one root cause rather than several symptoms.

## How flagged items are ranked

Importance is high if the area is Flagship, the item waits on the boss, it blocks two or more open items, or its area missed a metric target. Urgency is high if the item is overdue, due within 3 days, or a decision that has waited 5 days or more. That gives four groups: needs decision now, on your radar, flag but don't escalate, and omit. Inside the top group, decisions come first, quickest (yes or no) before hardest. Inside every group, Flagship comes before Core, and Core before Experimental.

## Week over week

Each flagged item is marked **new**, **back** after a gap, or its **Nth week running**. Anything flagged last week but not this week is listed as **done**, **cleared** (with the reason: deadline set, date moved, updated) or **removed, not done**, meaning it vanished from its tracker without ever being marked done. Due dates that keep moving are shown on the card, which is how a free-text "next Tuesday" that rolls forward every week gets caught.

A task kept on the page is recognised across weeks by its id, so it can be renamed or reassigned. In the example, an item is its area and its title: owner changes don't break the link, renaming does.

## How it is built

```
index.html                 the page
app/engine/                the rules: parse, loaders, normalize, rules, classify, briefing, history
app/ui/                    intro, setup, tasks, this week (sheets, requests, uploads), the CEO view, notes, backup
app/vendor/                SheetJS, for reading Excel
data/                      the example: four weeks of task lists and metrics, owner table, file list
scripts/generate_dataset.py  rebuilds data/ (plain Python, no packages)
```

Plain JavaScript modules, no build step and no packages to install. No AI model anywhere: scoring is plain rules against stated fields.

```
npm test          # Node 20 or later, no install needed
```

`tests/scenarios.test.js` covers the example's week 1 and `tests/history.test.js` weeks 2 to 4, one test per row of [`docs/dataset_key.md`](docs/dataset_key.md). `tests/rules.test.js` and `tests/metrics.test.js` cover cases the example doesn't contain. `tests/weekly.test.js` covers setup, the leaders' and people's sheets, reading them back, requests and the reminder; `tests/parse.test.js` the CSV reader, `tests/edits.test.js` ticks and date changes on the example, and `tests/notes.test.js` notes, owner emails and email drafts.

## Known limits

- Your data lives in one browser until you export a backup. Two people can't work on the same briefing at once.
- A reply to an email draft only shows on the page once someone pastes it in.
- The page can't send the Monday emails itself. It drafts them in your email app, and the calendar reminder does the nudging.
- Metrics are judged one week at a time against a fixed weekly target. Last week is shown beside them, not scored.
- Only the Flagship tier changes which group an item lands in. Core and Experimental differ only in the order inside a group.
- In the example, renaming an item breaks its history. Tasks kept on the page don't have this problem.
- "Next Tuesday" is read as the nearest coming Tuesday. The page shows the original text beside every date it had to interpret.

## Why it exists

A portfolio piece and a use case to copy. The judgment underneath (flag, don't resolve; score importance and urgency separately; don't trust a metric without enough volume behind it; notice what keeps coming back) comes from the chief-of-staff skill in my personal Claude Code agent. The rules here were designed fresh for this problem.
