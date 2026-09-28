# Chief of Staff Briefing

A rules engine that turns messy weekly reporting from several business units into one prioritized briefing for a CEO, and keeps track from week to week. It flags what is overdue, stale, in conflict, or waiting on a decision. It never resolves or decides anything itself.

The company, units, people and numbers are fictional. Every row in the dataset was written by hand to test one rule. This is a portfolio piece, not a production tool, same posture as `scan`.

**Open it: https://vedantm1049.github.io/chief-of-staff-briefing/**

It opens on the latest week of the sample, with the earlier weeks one click away. It is one static page. The rules run in your browser, and there is no server. You can tick an item done or change a due date, and add notes: the CEO's questions and decisions, or the Chief of Staff's own. "Draft email" opens a draft to the item's owner in your own email app, with the Chief of Staff copied, and their answer can be pasted back as a reply. All of it is saved in your own browser only, and can be exported as a backup file and imported again. Notes never change how an item is scored.

## Why it exists

The other repos in this portfolio (`cafe-qc`, `cafe-picture-generator`, `scan`) are operator tools: one business, its own numbers. This one is a Chief of Staff tool. The job is to read inconsistent reporting from several units and decide what belongs in front of someone else, and what doesn't.

The judgment underneath (flag, don't resolve; score importance and urgency separately; don't trust a metric without enough volume behind it; notice what keeps coming back) comes from the chief-of-staff skill in my personal Claude Code agent. The rules here were designed fresh for this problem rather than copied over.

## The scenario

Wasla Group is a fictional Dubai holding company, modeled on the business-line mix of regional aggregators such as Talabat, noon and Careem, not on any one company's internals. Six units report to a Group CEO each week:

| Unit | Business | Tier |
|---|---|---|
| Wasla Eats | Food delivery marketplace | Flagship |
| Wasla Mart | Dark-store grocery delivery | Flagship |
| Wasla Table | Dine-out reservations and payments | Core |
| Wasla Express | 1 to 2 hour delivery from partner stores | Experimental |
| Wasla Pay | Payments and wallet | Core |
| Wasla Central | Shared legal, design, investor relations, tech and growth | Core |

Each unit sends a KPI export, a free-text status update, and a list of open tasks, each in its own format. Mart sends a three-tab Excel file; the rest send CSVs with different columns. Table has no status column at all. Mart's status values are inconsistent ("in progress", "complete", "done", blank). Owners appear as full names, "P. Nair", or first names only. Due dates are ISO dates, free text ("next Tuesday"), or blank. Columns go missing from one week to the next.

There are four weeks of data, ending 27 Sep to 18 Oct 2026. Over those weeks decisions get made, work gets done, one item quietly disappears from a tracker, and one untouched item climbs to the top while its unit's updates stay upbeat. [`docs/dataset_key.md`](docs/dataset_key.md) walks through every case week by week. Full spec: [`docs/data_contract.md`](docs/data_contract.md).

## How it works

```
index.html                 the page
data/weeks/<week>/         six units' files for each week
data/alias_table.csv       hand-reviewed owner-name matches and owner emails, shared across weeks
data/manifest.json         the list of files the page loads
app/engine/parse.js        read CSV and Excel (SheetJS, stored in app/vendor)
app/engine/loaders.js      read each unit's format into one common record
app/engine/normalize.js    resolve owner names, read status and dates from free text
app/engine/rules.js        overdue, stale, conflict, blocked items, no deadline, customer ratings
app/engine/classify.js     importance x urgency, effort and tier order inside a group
app/engine/briefing.js     score one week, apply the reader's own edits
app/engine/history.js      line the weeks up: new, still open, closed
app/ui/                    draw the page, week switcher, edits, notes, email drafts, backup and import
```

Plain JavaScript modules, no build step and no packages to install. The page loads its data files from the site it is served from, so it runs on GitHub Pages or any local web server, not from a double-clicked file.

```
npm test                              # Node 20 or later, no install needed
python scripts/generate_dataset.py   # rebuild data/ (needs pandas and openpyxl)
```

### What gets flagged

- **Overdue**: an open item past its due date.
- **Stale**: an open item untouched for 7 days or more. Only the last-updated date counts. Express describes an item as having "huge momentum" week after week while it sits untouched; the engine flags it anyway.
- **Conflict**: one person with two open items due within a day of each other. This depends on owner names resolving correctly. "P. Nair" must merge into "Priya Nair" for her conflict to appear; "Rahul Mehta" and "Raj Mehta" must stay apart.
- **Decision pending**: status says so, or the description uses one of a fixed list of phrases ("waiting on ... sign-off", "awaiting decision"). Split by whether it is waiting on the CEO or on someone else. A decision's wait is measured by its own clock and never called stale.
- **No deadline**: no usable due date, blank or unreadable. Listed separately so a date gets set, not scored as "not urgent" and dropped.
- **Customer-rating miss**: a unit's rating this week is more than 0.2 below its own target, with at least 10 rated interactions (the same floor `cafe-qc` uses).

An item waiting on another open item is neither stale nor overdue in its own right. It is listed on its blocker's card, so the briefing points at one root cause rather than several symptoms.

### How flagged items are ranked

Importance is high if the unit is Flagship, the item waits on the CEO, it blocks two or more open items, or its unit missed its customer-rating target. Urgency is high if the item is overdue, due within 3 days, or a decision that has waited 5 days or more. That gives four groups: needs decision now, on your radar, flag but don't escalate, and omit. Inside the top group, decisions come first, quickest (confirm or reject) before hardest. Inside every group, Flagship items come before Core, and Core before Experimental.

### Week over week

Each flagged item is marked **new**, **back** after a gap, or its **Nth week running**. Anything flagged last week but not this week is listed as **done**, **cleared** (with the reason: deadline set, date moved, updated) or **removed, not done**, meaning it vanished from its unit's tracker without ever being marked done. Due dates that keep moving are shown on the card, which is how a free-text "next Tuesday" that rolls forward every week gets caught.

An item is recognised across weeks by its unit and its title, the text before the first comma. Owner changes don't break the link. Renaming an item does.

The owner-name alias table is built once, offline, by hand. The engine only reads it. A name it has never seen is reported at the top of the page rather than guessed at, since a new spelling can hide a conflict. Week 4 has one.

## Tests

`tests/scenarios.test.js` covers week 1 and `tests/history.test.js` covers weeks 2 to 4, one test per row of [`docs/dataset_key.md`](docs/dataset_key.md). `tests/rules.test.js` covers cases the contract requires but the data doesn't contain, such as "TBD" as a due date, "done" versus "Done" versus "complete", and an overdue decision that has only been pending two days. `tests/parse.test.js` covers the CSV reader, `tests/edits.test.js` the reader's own changes, and `tests/notes.test.js` notes, owner emails and email drafts.

## Known limits

- Only the Flagship tier changes which group an item lands in. Core and Experimental differ only in the order inside a group.
- Status-update prose is loaded but never scored. That is deliberate (prose is where stalled work hides), but it means the engine can't catch something that only appears in prose.
- Renaming an item breaks its history: it shows as one item closing and a new one opening. Two items with the same title in the same unit can't be told apart, and the page says so when it happens.
- "Next Tuesday" is read as the nearest coming Tuesday. The page shows the original text beside every date it had to interpret.
- Ratings are judged one week at a time. Last week's rating is shown for context, not scored.

## Out of scope

Suggested fixes or next steps. A chat layer. Any output other than the static page.

`scripts/generate_dataset.py` rebuilds everything in `data/` and is included for transparency.
