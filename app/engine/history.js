/* Week-over-week comparison. Scores each week on its own, then lines the
weeks up so every flagged item carries its history: new this week, back
after a gap, or how many weeks running. Items flagged last week but not this
week are reported as closed, with the reason: done, cleared, or removed from
the tracker without being marked done.

An item's identity across weeks is its area plus its title (see rules.js:
itemKey). Nothing here changes how a week is scored.
*/
import { buildBriefing, flaggedCommitments } from "./briefing.js";
import { itemKey } from "./rules.js";
import { fmtShort } from "./dates.js";

function index(commitments) {
  const out = new Map(), dupes = [];
  for (const c of commitments) {
    const k = itemKey(c);
    if (out.has(k)) { dupes.push(k.split("\u0000")); continue; }
    out.set(k, c);
  }
  return [out, dupes];
}

/** weeks: [{ weekEnding, tasks, metrics }], any order. Returns one briefing per week,
oldest first, each with .comparison set. Options pass through to
buildBriefing, except today: each week is read the Monday after it. */
export function buildHistory(weeks, options = {}) {
  const sorted = [...weeks].sort((a, b) => (a.weekEnding < b.weekEnding ? -1 : 1));
  const briefings = sorted.map((w) => buildBriefing(w, { ...options, today: null }));

  const flagged = [], everything = [], dupes = [];
  for (const b of briefings) {
    flagged.push(index(flaggedCommitments(b))[0]);
    const [all, d] = index(b.allCommitments);
    everything.push(all);
    dupes.push(d);
  }

  briefings.forEach((b, i) => {
    const items = new Map();   // commitment -> item history
    for (const [key, c] of flagged[i]) {
      let run = 1;
      while (i - run >= 0 && flagged[i - run].has(key)) run++;
      const earlier = [];
      for (let k = 0; k < i - run + 1; k++) if (flagged[k].has(key)) earlier.push(k);
      const label = i === 0 ? "baseline" : run > 1 ? "running" : earlier.length ? "returned" : "new";

      const dueDates = [], raws = new Set();
      for (let k = 0; k <= i; k++) {
        const prior = everything[k].get(key);
        if (!prior) continue;
        raws.add(prior.dueDateRaw);
        if (prior.dueDate != null && (!dueDates.length || dueDates.at(-1) !== prior.dueDate)) {
          dueDates.push(prior.dueDate);
        }
      }

      items.set(c, {
        label,                                  // "baseline" | "new" | "returned" | "running"
        weeksRunning: run,
        since: briefings[i - run + 1].weekEnding,   // week the current run started
        lastFlagged: label === "returned" ? briefings[Math.max(...earlier)].weekEnding : null,
        dueDates,                               // distinct due dates over time, oldest first
        dueRaw: raws.size === 1 && c.dueDateApprox ? [...raws][0] : null,   // the free text, if always the same
      });
    }

    const closed = [];
    if (i > 0) {
      for (const [key, before] of flagged[i - 1]) {
        if (flagged[i].has(key)) continue;
        let run = 1;
        while (i - 1 - run >= 0 && flagged[i - 1 - run].has(key)) run++;
        closed.push(closedItem(before, everything[i].get(key) ?? null, run));
      }
    }

    const prev = i > 0 ? briefings[i - 1] : null;
    b.comparison = {
      previousWeek: prev ? prev.weekEnding : null,
      items,
      closed,
      prevMetrics: prev ? Object.fromEntries(prev.metricResults.map((r) => [`${r.area}\u0000${r.metric}`, r])) : {},
      duplicateTitles: dupes[i],   // [[area, title]]: two items, one title, history can't tell them apart
      count(label) {
        let n = 0;
        for (const h of items.values()) if (h.label === label) n++;
        return n;
      },
    };
  });
  return briefings;
}

function closedItem(before, now, weeksFlagged) {
  if (now == null) {
    return { before, now: null, outcome: "dropped",
      detail: "Removed from the tracker without being marked done.", weeksFlagged };
  }
  if (now.status === "done") {
    const when = now.lastUpdated != null ? ` on ${fmtShort(now.lastUpdated)}` : "";
    return { before, now, outcome: "done", detail: `Marked done${when}.`, weeksFlagged };
  }

  const reasons = [];
  if (before.dueDate == null && now.dueDate != null) {
    reasons.push(`deadline set for ${fmtShort(now.dueDate)}`);
  } else if (before.dueDate != null && now.dueDate != null && now.dueDate > before.dueDate) {
    reasons.push(`due date moved from ${fmtShort(before.dueDate)} to ${fmtShort(now.dueDate)}`);
  }
  if (now.lastUpdated != null && before.lastUpdated != null && now.lastUpdated > before.lastUpdated) {
    reasons.push(`updated ${fmtShort(now.lastUpdated)}`);
  }
  const detail = reasons.length
    ? `Still open, no longer flagged: ${reasons.join(", ")}.`
    : "Still open, no longer meets a flag rule.";
  return { before, now, outcome: "cleared", detail, weeksFlagged };
}
