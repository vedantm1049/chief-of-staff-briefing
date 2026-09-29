# Dataset key

The example company, Wasla Group, is made up. Its structure follows a setup a real Chief of Staff made on the page, with every name, email, product and number changed; the tasks keep the kind of work they described. Everything else is written by hand to show one rule at work, so this key doubles as a test plan: each line is a case the engine should get right. Week 1 is tested in `tests/scenarios.test.js`, weeks 2 to 4 in `tests/history.test.js`.

Four weeks, ending 2026-09-27, 10-04, 10-11 and 10-18, each scored as of the Monday after (09-28, 10-05, 10-12, 10-19). The data is `data/example.json`, written by `scripts/generate_example.py`.

## The company

| Business | Tier | Leader | Metrics, weekly target |
|---|---|---|---|
| Wasla Minutes (quick commerce) | Flagship | Farah Al Mansoori | Orders 400,000; customer rating 4.5; average delivery time 20 minutes, lower is better |
| Wasla.com (marketplace) | Core | Rahul Mehta | Sales AED 30M; customer rating 4.7, 0.1 margin |
| Wasla Food (food delivery) | Core | Ahmed El-Sayed | Orders 200,000; on-time delivery 85%; customer rating 4.5 |
| Wasla Labs (new ventures) | Experimental | Omar Siddiqui | New customers 8,000; live projects 5; customer churn 5%, lower is better |
| Wasla Central (investor relations, legal, CEO office, brand, finance) | Core | Layla Haddad | Cash balance AED 25M; net promoter score 70; staff attrition 0.5%, lower is better |

People who own work: the five leaders, plus Zayd (Minutes), Raj Mehta (Wasla.com), Mina (Food), Reem Qassim and Priya Nair (Central). Priya's name also turns up as "P. Nair". Raj and Rahul Mehta are two different people.

## Week 1, ending 2026-09-27

### Waiting on the CEO

- **Reem Qassim, clear the visa block with immigration (pay AED 150K in fines)**: waiting on the CEO since 21 Sep, 7 days, due 1 Oct. Yes or no, so Low effort. First in "needs decision now". It holds up Reem's hiring for Wasla Minutes.
- **Priya Nair, finish and launch the ice-cream summer campaign**: waiting on the CEO to pick one of three options since 10 Sep, due 15 Sep, 13 days overdue. Medium effort, so second, below the quicker yes or no. It holds up three open items: the branding for Wasla Wash directly, and through it the Wasla Wash launch and the Wasla Business prototype.
- **Reem Qassim, approve the office move to a new Dubai floor (AED 90K fit-out)**: waiting on the CEO 3 days, due 9 Oct. Important because it waits on the CEO, not yet urgent: "on your radar".

### A chain of blocked work

- **Branding for Wasla Wash** (Priya, 3 days overdue, untouched 16 days) waits on the ice-cream decision. **Launch Wasla Wash** (Omar) waits on the branding. **The Wasla Business prototype** (Omar) waits on the launch. **Hiring for Wasla Minutes** (Reem, untouched 13 days) waits on the visa block. None of them is flagged in its own right: each is listed on the card of the open item it waits for, so the briefing points at the decisions that would unblock them.

### Overdue in a Flagship business

- **Zayd, the rider agency contract for Sharjah stores**: 4 days overdue, Wasla Minutes is Flagship. "Needs decision now", after the two decisions.

### Stalled work

- **Mina, roll out the new rider app in Sharjah**: untouched since 12 Sep, 16 days, while the task says "huge momentum, on the verge of a big unlock". Only the last-updated date counts: stale. Its due date is "next Tuesday", read as 29 Sep, due in 1 day, so it is urgent; Wasla Food is Core: "flag, don't escalate".
- **Omar, the corporate laundry pilot**: untouched since 5 Sep. Stale, but Experimental and due 20 Oct: "omit".

### One person, two deadlines

- **Layla Haddad**: the seller contract template for Wasla.com (due 30 Sep) and the board pack legal review (due 1 Oct), one day apart. A conflict: "flag, don't escalate".

### Waiting on someone else

- **Rahul Mehta, the returns policy change**: waiting on Legal, not the CEO, for 3 days, due 8 Oct. Core, no fan-out: "omit".

### No deadline

- **Priya, the Q4 brand refresh workshop**: no due date. Listed under "needs a deadline set", not scored as not urgent.

### Metrics

- **Wasla Minutes, average delivery time**: 23.5 minutes against 20, lower is better, 10% margin. A miss. Minutes is Flagship already, so no item moves.
- **Wasla.com, customer rating**: 4.66 against 4.7 on a 0.1 margin. Within.
- Every other metric is met.

### People

- Every owner is on the people list. Raj and Rahul Mehta stay two people. "P. Nair" is on file as another spelling of Priya Nair.

## Week 2, ending 2026-10-04 (scored 2026-10-05)

- **Decided**: the visa block. The CEO said yes on 29 Sep, recorded on the page, and the fines were paid. Closed as "Decided: Yes, go ahead".
- **Closed as done**: the rider agency contract, the seller contract and the board pack.
- **Hiring for Wasla Minutes**: unblocked and touched on 2 Oct, so not flagged.
- **The office move**: waiting 10 days now, urgent. It moves up to "needs decision now", first as the quickest decision, 2nd week running.
- **The ice-cream campaign**: still waiting on the CEO, 2nd week running, still holding up the branding.
- **Rahul, same-day delivery in Abu Dhabi**: a new decision waiting on the CEO, three options. Pending 3 days: "on your radar", marked new.
- **The returns policy**: waiting on Legal 10 days, urgent: "flag, don't escalate". Not called stale: a decision's wait is not the owner's neglect.
- **The rider app**: still untouched, 2nd week running. "Next Tuesday" now reads 6 Oct.
- **Wasla Minutes' delivery time** misses again, 22.8 minutes.

## Week 3, ending 2026-10-11 (scored 2026-10-12)

- **The ice-cream campaign**: the CEO chose option two, the smaller launch, on 6 Oct. Closed as "Decided" after 2 weeks flagged.
- **Branding for Wasla Wash**: with its blocker done, its 30 days untouched and 16 days overdue count. It holds up two open items, the Wasla Wash launch and, behind it, the Wasla Business prototype, which makes it important although Central is Core. New, "needs decision now", after the same-day delivery decision.
- **The office move**: the CEO said yes. Closed as "Decided". **The returns policy**: Legal approved it, not the CEO, so it closes as done.
- **The laundry pilot**: deleted from the tracker, never marked done. Closed as "removed, not done".
- **The brand refresh workshop**: finally has a date, 22 Oct. Closed as cleared, "deadline set for 22 Oct".
- **Same-day delivery**: waiting 10 days, "needs decision now", 2nd week running.
- **Raj Mehta, extend the payments provider contract by 12 months**: a new yes or no for the CEO, pending 4 days: "on your radar".
- **The rider app**: 3rd week running, due date now 13 Oct.
- Every metric is met.

## Week 4, ending 2026-10-18 (scored 2026-10-19). The landing page

- **Top group order**: Raj's contract extension (yes or no, Low effort, 2nd week) above Rahul's same-day delivery (three options, Medium, 3rd week, now overdue), even though Rahul's has waited longer. Then the rider app.
- **Wasla Food's customer rating**: 4.1 against 4.5 on 12,000 ratings. A miss, which makes Food's items important. The rider app, untouched for 37 days, due "next Tuesday" (20 Oct, tomorrow), moves up to "needs decision now", 4th week running, its due date moved four times (29 Sep, 6 Oct, 13 Oct, 20 Oct).
- **Branding for Wasla Wash**: done 14 Oct, closed after 1 week flagged.
- **Launch Wasla Wash**: unblocked, due 5 Oct, 14 days overdue, touched 16 Oct. Overdue, Experimental: "flag, don't escalate", holding up the Wasla Business prototype.
- **The brand refresh workshop**: back, last flagged 4 Oct, in a same-day clash with Priya's brand guidelines for Wasla Business, both due 22 Oct. The guidelines are new.
- **Wasla Labs** sent no numbers this week: its three metrics show as not reported.
