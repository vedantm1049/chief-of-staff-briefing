# Chief of Staff Briefing: notes for Claude

## What this repo is

A public portfolio repo with two jobs:

1. Show Chief of Staff judgment: reading messy, inconsistent reporting from several units and deciding what belongs in front of a CEO, and what doesn't.
2. Show people a use case they can build: a Chief of Staff or executive assistant should be able to set it up for their own areas and feed it once a week.

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

- data/weeks/<week_ending>/<unit>/: each unit's KPI export, status update and open tasks, four weeks. Each week is scored as of the Monday after it.
- data/alias_table.csv: hand-reviewed owner-name matches and fictional owner emails (.example domain), shared across weeks. "L. Haddad" is deliberately missing (week 4 story).
- index.html: the page. app/engine/: the rules as JavaScript modules (parse, loaders, normalize, rules, classify, briefing, history). app/ui/: drawing the page, edits, backup. app/vendor/: SheetJS for Excel.
- data/manifest.json: the list of files the page loads, written by the generator.
- scripts/generate_dataset.py: rebuilds data/. Its alias table carries hand-written review notes; don't let a rerun lose them.
- tests/: scenarios.test.js (week 1) and history.test.js (weeks 2 to 4) map one to one to dataset_key.md rows. rules.test.js (edge cases the data doesn't contain), parse.test.js (CSV reader), edits.test.js (the reader's edits) and notes.test.js (notes, emails, drafts) have no rows. Run with npm test.

## Rules as they stand

- Flags: overdue, stale (7+ days untouched, last-updated date only, never the prose), owner conflict (same person, due dates within 1 day, after alias resolution), decision pending (status or a fixed phrase list; split by waiting on the CEO or on someone else), no deadline (blank or unreadable due date).
- A pending decision is never called stale. An item blocked by another open item is neither stale nor overdue; it is listed on its blocker's card.
- Importance: Flagship tier, waiting on the CEO, blocks 2+ open items, or its unit missed its customer-rating target (more than 0.2 below, at least 10 ratings). Urgency: overdue, due within 3 days, or a decision pending 5+ days.
- Four groups: needs decision now, on your radar, flag don't escalate, omit. Inside the top group, decisions first, Low effort before High. Inside every group, Flagship, then Core, then Experimental, then most overdue.
- Week over week: an item's identity is its unit plus its title (text before the first comma). Each flag is marked new, back after a gap, or Nth week running. Closed items are done, cleared (with the reason) or removed without being marked done. Due dates that keep moving are shown.
- A name missing from the alias table is reported at the top of the page, never guessed.
- The reader can tick an item done or set its due date. The edit applies to that week only; next week's files win.
- The CEO decides, the Chief of Staff maintains the page. Notes (from the CEO or the Chief of Staff) stay with an item across weeks. "Draft email" opens a mailto draft in the reader's own email app, always copying the Chief of Staff (address set on the page); the page never sends anything and the draft holds only the note and the card's facts. Replies are pasted in by hand. Notes never change a score.

## Open questions for Vedant

- None right now.

## Next: steps 2 and 3 (agreed)

Step 2: the app, running on the Wasla sample.

- One static page, hosted on GitHub Pages. No server, no build step.
- Move the rules to JavaScript so they run in the browser, and retire the Python engine so there is one copy of the rules. Port every test and keep the one-test-per-row mapping. Node's built-in test runner is enough. (Running Python inside the page was rejected: 10 to 15 seconds to open.) The dataset generator can stay in Python.
- Opens with the Wasla example already loaded: four weeks, week switcher, week-over-week comparison. An empty setup form must never be the first screen. "Start your own" is the second click.
- Keep the page order: one-line summary first, then the top decision, then the rest.
- The user can tick an item done or change a due date. Everything is saved in the user's own browser only, with Export backup and Import buttons. Say this plainly on the page: confidential data never leaves their machine, and it lives on one browser until exported.

Step 3: setup for their own areas.

- Call them "areas". It must work whether the user's areas are departments, a portfolio of businesses, business lines, or other verticals. The user names the kind.
- Open tasks first, metrics second. Setup asks for: the areas and how much each matters (tier), who the boss is, and who owns work. Owner-name matching happens in the UI: a new name prompts "is this the same person as ...?", never a guess.
- Metrics: one or two health numbers per area, each with a target, suggested from a fixed list by area type (for example food delivery: orders, on-time delivery, customer rating; payments: transaction volume, dispute rate, satisfaction). The user confirms or swaps.
- Weekly input: drop in whatever the teams sent (Excel, CSV, pasted table). Match columns once per area; the app remembers the matching.
- Live data: read a Google Sheet published to the web as a CSV link. Warn that publishing makes the sheet readable by anyone with the link and recommend file upload for confidential data. Dashboards (Looker Studio, Power BI and similar) go in as a CSV export; no direct link.
