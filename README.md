# Chief of Staff Briefing

A weekly briefing for a Chief of Staff to run for their own company. Each week the teams send their task lists; the page reads them and puts in front of the CEO only what needs them: work that is overdue, stalled, clashing for one person, or waiting on a decision. It keeps the history from week to week. It flags. It never resolves, reassigns, decides or suggests.

**Open it: https://vedantm1049.github.io/chief-of-staff-briefing/**

It runs in your browser. There is no server and no account, and nothing you load leaves your computer.

## Use it for your company

1. **Set up once.** Your company's name, who the briefing is for (CEO, Managing Director, whatever the title), what you call the parts of the company you report on (departments, businesses, brands, markets), each one and how much it matters, and your own email. Owners and their emails can be added now or as they appear.
2. **Send the teams the template**, or don't. The page has a tasks template and an optional metrics template to download, with your areas filled in. Teams that won't change their own tracker can keep it: drop in their Excel or CSV, match its columns once, and the page remembers the match for next time. A table pasted from Excel or Google Sheets works too.
3. **Add each week.** Pick the week-ending date and drop in the files. A name the page hasn't seen gets a question, "is P. Nair the same person as Priya Nair?", never a guess. An area it doesn't know gets the same.
4. **Read the briefing.** Flagged items sorted into four groups, with the reasons on each card, and what changed since last week. Tick an item done, change a due date, add a note from the CEO, draft an email to the owner (the Chief of Staff is copied), and paste their reply back.

Everything is kept in the browser you use, until you export a backup. That is the price of nothing leaving your computer: to move to another laptop, export a backup and import it there.

### The template

Tasks, one row per task:

| Column | What goes in it |
|---|---|
| `area` | which area the task belongs to, as named in setup |
| `task` | the task. Its title is the text before the first comma; the rest can change week to week |
| `owner` | who owns it |
| `due_date` | YYYY-MM-DD. "next Tuesday" and "end of next week" also work, and are shown as read |
| `status` | Open, In progress, Waiting on decision, or Done |
| `waiting_on` | for a decision, who it waits on. The boss's title here makes it waiting on the boss |
| `blocked_by` | the title of another task this one can't move without |
| `decision_type` | for a decision: Yes or no, Pick an option, or Open question |
| `last_updated` | YYYY-MM-DD, when someone last touched it |

Metrics, optional: `area`, `metric` (Customer rating), `segment` (a city or store, if an area reports several), `value`, `target`, `count` (how many ratings).

## See it on an example first

The example is Wasla Group, a made-up Dubai holding company with six businesses, modeled on the mix of regional aggregators such as Talabat, noon and Careem, not on any one company's internals. Four weeks of reports, ending 27 Sep to 18 Oct 2026, all on the template. Every row was written by hand to test one rule. Over the four weeks decisions get made, work gets done, one item quietly disappears from a tracker, and one untouched item climbs to the top while its owner describes it as having "huge momentum". [`docs/dataset_key.md`](docs/dataset_key.md) walks through every case. Full spec: [`docs/data_contract.md`](docs/data_contract.md).

| Business | What it does | Tier |
|---|---|---|
| Wasla Eats | Food delivery marketplace | Flagship |
| Wasla Mart | Dark-store grocery delivery | Flagship |
| Wasla Table | Dine-out reservations and payments | Core |
| Wasla Express | 1 to 2 hour delivery from partner stores | Experimental |
| Wasla Pay | Payments and wallet | Core |
| Wasla Central | Shared legal, design, investor relations, tech and growth | Core |

## What gets flagged

- **Overdue**: an open item past its due date.
- **Stale**: an open item untouched for 7 days or more. Only the last-updated date counts, never how the task is worded.
- **Conflict**: one person with two open items due within a day of each other, after their name spellings are matched.
- **Decision pending**: status says so, or the task uses one of a fixed list of phrases ("waiting on ... sign-off", "awaiting decision"). Split by whether it waits on the boss or on someone else. A decision's wait is measured by its own clock and never called stale.
- **No deadline**: no usable due date, blank or unreadable. Listed so a date gets set, not scored as "not urgent" and dropped.
- **Customer-rating miss**: an area's rating this week is more than 0.2 below its own target, with at least 10 ratings.

An item waiting on another open item is neither stale nor overdue in its own right. It is listed on its blocker's card, so the briefing points at one root cause rather than several symptoms.

## How flagged items are ranked

Importance is high if the area is Flagship, the item waits on the boss, it blocks two or more open items, or its area missed its customer-rating target. Urgency is high if the item is overdue, due within 3 days, or a decision that has waited 5 days or more. That gives four groups: needs decision now, on your radar, flag but don't escalate, and omit. Inside the top group, decisions come first, quickest (yes or no) before hardest. Inside every group, Flagship comes before Core, and Core before Experimental.

## Week over week

Each flagged item is marked **new**, **back** after a gap, or its **Nth week running**. Anything flagged last week but not this week is listed as **done**, **cleared** (with the reason: deadline set, date moved, updated) or **removed, not done**, meaning it vanished from its tracker without ever being marked done. Due dates that keep moving are shown on the card, which is how a free-text "next Tuesday" that rolls forward every week gets caught.

An item is recognised across weeks by its area and its title. Owner changes don't break the link. Renaming an item does.

## How it is built

```
index.html                 the page
app/engine/                the rules: parse, loaders, normalize, rules, classify, briefing, history
app/ui/                    intro, setup, adding a week, the briefing, notes, email drafts, backup
app/vendor/                SheetJS, for reading Excel
data/                      the example: four weeks of template files, owner table, file list
scripts/generate_dataset.py  rebuilds data/ (plain Python, no packages)
```

Plain JavaScript modules, no build step and no packages to install. No AI model anywhere: scoring is plain rules against stated fields.

```
npm test          # Node 20 or later, no install needed
```

`tests/scenarios.test.js` covers the example's week 1 and `tests/history.test.js` weeks 2 to 4, one test per row of [`docs/dataset_key.md`](docs/dataset_key.md). `tests/rules.test.js` covers cases the example doesn't contain. `tests/intake.test.js` covers reading and matching a team's own files, `tests/parse.test.js` the CSV reader, `tests/edits.test.js` ticks and date changes, and `tests/notes.test.js` notes, owner emails and email drafts.

## Known limits

- Your data lives in one browser until you export a backup. Two people can't work on the same briefing at once.
- A reply to an email draft only shows on the page once someone pastes it in.
- Only the customer rating is scored among metrics. Other health numbers need their own rule (which direction is good, how far off is a miss) and aren't in yet.
- Only the Flagship tier changes which group an item lands in. Core and Experimental differ only in the order inside a group.
- Renaming an item breaks its history: it shows as one item closing and a new one opening.
- "Next Tuesday" is read as the nearest coming Tuesday. The page shows the original text beside every date it had to interpret.

## Why it exists

A portfolio piece and a use case to copy. The judgment underneath (flag, don't resolve; score importance and urgency separately; don't trust a metric without enough volume behind it; notice what keeps coming back) comes from the chief-of-staff skill in my personal Claude Code agent. The rules here were designed fresh for this problem.
