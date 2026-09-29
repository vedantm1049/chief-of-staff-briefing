# Chief of Staff Briefing: notes for Claude

## What this repo is

A public portfolio repo with two jobs:

1. Show Chief of Staff judgment: reading messy, inconsistent reporting from several units and deciding what belongs in front of a CEO, and what doesn't.
2. Be usable: a Chief of Staff or executive assistant sets it up for their own areas and feeds it once a week. This is the main job now; the Wasla example is the demo, not the product.

The company (Wasla Group), people and numbers are fictional and hand-designed. It is not a production tool. Never add real company data to this repo.

## Hard rules

- The tool flags. It never resolves, reassigns, decides, or suggests next steps. This is not up for debate.
- No AI model at runtime. Scoring is plain rules against stated fields. Metric suggestions come from a fixed list, not a model.
- Every rule change updates docs/data_contract.md (log it in section 7) and docs/dataset_key.md, and adds or updates a test. Scenario tests map one to one to rows in dataset_key.md; edge-case tests live in rules.test.js.
- After adding or changing a rule, break it on purpose and confirm a test fails. Then restore it.
- Writing, everywhere (UI copy, docs, code comments, commit messages): no em dashes; use commas or periods. Plain language, short sentences, no unexplained jargon or acronyms.
- Work only in this repo. Never touch Vedant's other repos.
- Vedant prefers direct, terse updates and honest criticism over reassurance. Flag spec problems instead of quietly working around them.

## Where things are

- data/weeks/<week_ending>/<area>/: the example's tasks.csv and metrics.csv per area (docs/data_contract.md section 3), four weeks. Each week is scored as of the Monday after it. The example's setup (leaders, metrics, targets) is WASLA_SETUP in app/engine/config.js.
- data/alias_table.csv: hand-reviewed owner-name matches and fictional owner emails (.example domain), shared across weeks. "L. Haddad" is deliberately missing (week 4 story).
- index.html: the page. app/engine/: the rules as JavaScript modules (parse, loaders, normalize, rules, classify, briefing, history). app/engine/metrics.js is the metric rule. app/ui/: main (screens and events), screens (intro, setup, tasks, this week), weekly (sheets, reading them back, requests, reminder, starting a week), render (the CEO view), store (the two workspaces, backup), intake (reading files, likely name matches), notes. app/vendor/: SheetJS for Excel.
- data/manifest.json: the list of files the page loads, written by the generator.
- scripts/generate_dataset.py: rebuilds data/ (plain Python, no packages). Its alias table carries hand-written review notes; don't let a rerun lose them.
- tests/: scenarios.test.js (week 1) and history.test.js (weeks 2 to 4) map one to one to dataset_key.md rows. rules.test.js (edge cases the data doesn't contain), parse.test.js (CSV reader), edits.test.js (the reader's edits), notes.test.js (notes, emails, drafts), weekly.test.js (the weekly routine) and most of metrics.test.js have no rows. Run with npm test.

## Rules as they stand

- Flags: overdue, stale (7+ days untouched, last-updated date only, never the prose), owner conflict (same person, due dates within 1 day, after alias resolution), decision pending (status or a fixed phrase list; split by waiting on the CEO or on someone else), no deadline (blank or unreadable due date).
- A pending decision is never called stale. An item blocked by another open item is neither stale nor overdue; it is listed on its blocker's card.
- Importance: Flagship tier, waiting on the boss (the title from setup, in waiting_on or the task text), blocks 2+ open items, or its area missed a metric target (worse than target by more than the metric's margin, in its good direction, and on at least its minimum count if it has one). Urgency: overdue, due within 3 days, or a decision pending 5+ days.
- Four groups: needs decision now, on your radar, flag don't escalate, omit. Inside the top group, decisions first, Low effort before High. Inside every group, Flagship, then Core, then Experimental, then most overdue.
- Week over week: an item's identity is its task id when it has one (tasks kept on the page), otherwise its area plus its title (text before the first comma). Each flag is marked new, back after a gap, or Nth week running. Closed items are done, cleared (with the reason) or removed without being marked done. Due dates that keep moving are shown.
- A name missing from the owner table is reported at the top of the page, never guessed. Adding a person whose name looks like someone's already there asks "same person as...?".
- The reader can tick an item done or set its due date. The edit applies to that week only; next week's files win.
- The CEO decides, the Chief of Staff maintains the page. Notes (from the CEO or the Chief of Staff) stay with an item across weeks. "Draft email" opens a mailto draft in the reader's own email app, always copying the Chief of Staff (address set on the page); the page never sends anything and the draft holds only the note and the card's facts. Replies are pasted in by hand. Notes never change a score.

## Open questions for Vedant

- None right now.

## Where the work stands

Built, as agreed with Vedant:

- First screen: a short intro with "Set up for your company" and "See an example". A returning user with a week goes straight to the CEO view.
- Setup in the browser: company, boss's title, what areas are called, the Chief of Staff's email, and per area its leader, tier and metrics (from a fixed suggestion list or typed), each with a weekly target, direction and margin.
- Tasks kept in the browser, per person, with ids. People can also update them through their own weekly sheet (both, by Vedant's choice).
- This week: start the week, each leader's metrics sheet and each person's tasks sheet as Excel, an email draft for each due Wednesday, a recurring Monday calendar reminder (Google Calendar link or .ics), and one drop zone for everything that comes back, checked before it applies.
- A metric miss raises that area's priority (Vedant's choice), like the old rating rule.
- The page never sends email itself; that would need a server. Vedant chose drafts plus the calendar reminder.

Not built:

- Reading a Google Sheet published to the web as a CSV link.
