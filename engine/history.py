"""Week-over-week comparison. Scores each weekly folder on its own, then lines
the weeks up so every flagged item carries its history: new this week, back
after a gap, or how many weeks running. Items flagged last week but not this
week are reported as closed, with the reason: done, cleared, or removed from
the tracker without being marked done.

An item's identity across weeks is its unit plus its title (see
engine/rules.py: item_key). Nothing here changes how a week is scored.
"""
import os
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from engine.briefing import build_briefing, flagged_commitments
from engine.rules import item_key


@dataclass
class ItemHistory:
    label: str                   # "baseline" | "new" | "returned" | "running"
    weeks_running: int
    since: date                  # week_ending the current run started
    last_flagged: Optional[date] = None   # for "returned": the previous time
    due_dates: list = field(default_factory=list)   # distinct due dates over time, oldest first
    due_raw: Optional[str] = None         # the free text, if every week used the same phrase


@dataclass
class ClosedItem:
    before: object               # last week's version of the item
    now: Optional[object]        # this week's version, None if removed
    outcome: str                 # "done" | "cleared" | "dropped"
    detail: str
    weeks_flagged: int


@dataclass
class WeekComparison:
    previous_week: Optional[date]
    items: dict                  # id(commitment) -> ItemHistory
    closed: list
    prev_health: dict            # unit name -> last week's CustomerHealthResult
    duplicate_titles: list       # [(unit, title)] two items one title: history can't tell them apart

    def count(self, label):
        return sum(1 for h in self.items.values() if h.label == label)


def discover_weeks(weeks_root):
    weeks = []
    for name in os.listdir(weeks_root):
        try:
            weeks.append(date.fromisoformat(name))
        except ValueError:
            continue
    return sorted(weeks)


def _index(commitments):
    out, dupes = {}, []
    for c in commitments:
        k = item_key(c)
        if k in out:
            dupes.append(k)
            continue
        out[k] = c
    return out, dupes


def _fmt(d):
    return f"{d.day} {d:%b}"


def build_history(weeks_root, alias_path=None):
    """Return one BriefingModel per week, oldest first, each with .comparison set."""
    weeks = discover_weeks(weeks_root)
    briefings = [build_briefing(os.path.join(weeks_root, w.isoformat()), alias_path=alias_path)
                 for w in weeks]

    flagged, everything, dupes = [], [], []
    for b in briefings:
        f, _ = _index(flagged_commitments(b))
        a, d = _index(b.all_commitments)
        flagged.append(f)
        everything.append(a)
        dupes.append(d)

    for i, b in enumerate(briefings):
        items = {}
        for key, c in flagged[i].items():
            run = 1
            while i - run >= 0 and key in flagged[i - run]:
                run += 1
            earlier = [k for k in range(i - run + 1) if key in flagged[k]]
            if i == 0:
                label = "baseline"
            elif run > 1:
                label = "running"
            elif earlier:
                label = "returned"
            else:
                label = "new"

            due_dates, raws = [], set()
            for k in range(i + 1):
                prior = everything[k].get(key)
                if prior is None:
                    continue
                raws.add(prior.due_date_raw)
                if prior.due_date and (not due_dates or due_dates[-1] != prior.due_date):
                    due_dates.append(prior.due_date)

            items[id(c)] = ItemHistory(
                label=label,
                weeks_running=run,
                since=briefings[i - run + 1].week_ending,
                last_flagged=briefings[max(earlier)].week_ending if label == "returned" else None,
                due_dates=due_dates,
                due_raw=next(iter(raws)) if len(raws) == 1 and c.due_date_approx else None,
            )

        closed = []
        if i > 0:
            for key, before in flagged[i - 1].items():
                if key in flagged[i]:
                    continue
                run = 1
                while i - 1 - run >= 0 and key in flagged[i - 1 - run]:
                    run += 1
                now = everything[i].get(key)
                closed.append(_closed(before, now, run))

        b.comparison = WeekComparison(
            previous_week=briefings[i - 1].week_ending if i > 0 else None,
            items=items,
            closed=closed,
            prev_health={r.unit_name: r for r in briefings[i - 1].customer_health} if i > 0 else {},
            duplicate_titles=dupes[i],
        )
    return briefings


def _closed(before, now, weeks_flagged):
    if now is None:
        return ClosedItem(before, None, "dropped",
                          "Removed from the tracker without being marked done.", weeks_flagged)
    if now.status == "done":
        when = f" on {_fmt(now.last_updated)}" if now.last_updated else ""
        return ClosedItem(before, now, "done", f"Marked done{when}.", weeks_flagged)

    reasons = []
    if before.due_date is None and now.due_date is not None:
        reasons.append(f"deadline set for {_fmt(now.due_date)}")
    elif before.due_date and now.due_date and now.due_date > before.due_date:
        reasons.append(f"due date moved from {_fmt(before.due_date)} to {_fmt(now.due_date)}")
    if now.last_updated and before.last_updated and now.last_updated > before.last_updated:
        reasons.append(f"updated {_fmt(now.last_updated)}")
    detail = ("Still open, no longer flagged: " + ", ".join(reasons) + "."
              if reasons else "Still open, no longer meets a flag rule.")
    return ClosedItem(before, now, "cleared", detail, weeks_flagged)
