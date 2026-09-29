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

- data/weeks/<week_ending>/<area>/: each area's tasks.csv and metrics.csv on the shared template (docs/data_contract.md section 3), four weeks. Each week is scored as of the Monday after it.
- data/alias_table.csv: hand-reviewed owner-name matches and fictional owner emails (.example domain), shared across weeks. "L. Haddad" is deliberately missing (week 4 story).
- index.html: the page. app/engine/: the rules as JavaScript modules (parse, loaders, normalize, rules, classify, briefing, history). app/ui/: main (screens and events), screens (intro, setup, add a week), intake (reading and matching uploads), render (the briefing), store (the two workspaces, backup), notes. app/vendor/: SheetJS for Excel.
- data/manifest.json: the list of files the page loads, written by the generator.
- scripts/generate_dataset.py: rebuilds data/ (plain Python, no packages). Its alias table carries hand-written review notes; don't let a rerun lose them.
- tests/: scenarios.test.js (week 1) and history.test.js (weeks 2 to 4) map one to one to dataset_key.md rows. rules.test.js (edge cases the data doesn't contain), parse.test.js (CSV reader), edits.test.js (the reader's edits), notes.test.js (notes, emails, drafts) and intake.test.js (uploads, column matching, own-company storage) have no rows. Run with npm test.

## Rules as they stand

- Flags: overdue, stale (7+ days untouched, last-updated date only, never the prose), owner conflict (same person, due dates within 1 day, after alias resolution), decision pending (status or a fixed phrase list; split by waiting on the CEO or on someone else), no deadline (blank or unreadable due date).
- A pending decision is never called stale. An item blocked by another open item is neither stale nor overdue; it is listed on its blocker's card.
- Importance: Flagship tier, waiting on the boss (the title from setup, in waiting_on or the task text), blocks 2+ open items, or its unit missed its customer-rating target (more than 0.2 below, at least 10 ratings). Urgency: overdue, due within 3 days, or a decision pending 5+ days.
- Four groups: needs decision now, on your radar, flag don't escalate, omit. Inside the top group, decisions first, Low effort before High. Inside every group, Flagship, then Core, then Experimental, then most overdue.
- Week over week: an item's identity is its area plus its title (text before the first comma). Each flag is marked new, back after a gap, or Nth week running. Closed items are done, cleared (with the reason) or removed without being marked done. Due dates that keep moving are shown.
- A name missing from the owner table is reported at the top of the page, never guessed. On upload, every new name and unknown area gets a question before the week can be saved.
- The reader can tick an item done or set its due date. The edit applies to that week only; next week's files win.
- The CEO decides, the Chief of Staff maintains the page. Notes (from the CEO or the Chief of Staff) stay with an item across weeks. "Draft email" opens a mailto draft in the reader's own email app, always copying the Chief of Staff (address set on the page); the page never sends anything and the draft holds only the note and the card's facts. Replies are pasted in by hand. Notes never change a score.

## Open questions for Vedant

- None right now.

## Where the work stands

Step 2 (the app on the example) is done. Step 3 (setup for your own areas) is built: intro screen with "Set up for your company" and "See an example", setup, template download, uploads of the template or any CSV, Excel or pasted table with columns matched once and remembered, name and area questions, two workspaces (example and own) kept apart in the browser.

Agreed in conversation, replacing the earlier plan:

- The first screen is a short intro with two buttons, not the example. A returning user with data goes straight to their briefing.
- Every area uses one template. Column matching stays for teams that won't adopt it.
- The example was rebuilt on the template, keeping only the quirks people type into any template.

Not built yet, from the original step 3:

- Metrics beyond the customer rating, suggested from a fixed list by area type. Needs a rule per metric (which direction is good, how far off is a miss) before it can be scored. Ask Vedant before designing it.
- Reading a Google Sheet published to the web as a CSV link, with the warning that publishing makes it readable by anyone with the link.
