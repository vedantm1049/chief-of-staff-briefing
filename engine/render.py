"""Renders a BriefingModel as one self-contained static HTML page. No backend,
no build step, no external requests. Open the file in any browser.

When the model carries a week-over-week comparison (engine/history.py), each
card also shows how long it has been flagged, due dates that keep moving, and
what closed since last week.
"""
import html
from datetime import date

from engine.config import MIN_RATED_SAMPLE, RATING_MISS_MARGIN, UNIT_TIERS
from engine.classify import (
    QUADRANT_NEEDS_DECISION_NOW,
    QUADRANT_ON_YOUR_RADAR,
    QUADRANT_FLAG_DONT_ESCALATE,
    QUADRANT_OMIT,
)

QUADRANT_META = {
    QUADRANT_NEEDS_DECISION_NOW: ("needs", "Important and urgent"),
    QUADRANT_ON_YOUR_RADAR: ("radar", "Important, not yet urgent"),
    QUADRANT_FLAG_DONT_ESCALATE: ("flag", "Urgent, not important"),
    QUADRANT_OMIT: ("omit", "Neither. Listed for audit, not for action"),
}

FLAG_LABELS = {
    "decision-pending": "Decision pending",
    "overdue": "Overdue",
    "stale": "Stale",
    "conflict": "Conflict",
}

CLOSED_CHIPS = {
    "dropped": ("removed", "Removed, not done"),
    "done": ("done", "Done"),
    "cleared": ("cleared", "Cleared"),
}


def _e(s):
    return html.escape(str(s)) if s is not None else ""


def _fmt_date(d):
    # Built by hand: strftime's "%-d" is not supported on Windows.
    if not isinstance(d, date):
        return "not set"
    return f"{d:%a} {d.day} {d:%b %Y}"


def _day(d):
    return f"{d.day} {d:%b}"


def _ordinal(n):
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _short(text, limit=48):
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "…"


def _plural(n, word, plural=None):
    return f"{n} {word}" if n == 1 else f"{n} {plural or word + 's'}"


def _unit_tag(unit):
    return f'<span class="unit-tag">{_e(unit)} · {_e(UNIT_TIERS.get(unit, ""))}</span>'


def _hist(b, c):
    return b.comparison.items.get(id(c)) if b.comparison else None


def _history_badge(h):
    if h is None or h.label == "baseline":
        return ""
    if h.label == "new":
        return '<span class="hist hist-new">New this week</span>'
    if h.label == "returned":
        return f'<span class="hist hist-back">Back, last flagged {_day(h.last_flagged)}</span>'
    return (f'<span class="hist hist-running" title="Flagged every week since {_day(h.since)}">'
            f'{_ordinal(h.weeks_running)} week running</span>')


def _due_moves(h):
    if h is None or len(h.due_dates) < 2:
        return ""
    path = " → ".join(_day(d) for d in h.due_dates)
    why = ""
    if h.due_raw:
        why = f' Written as "{_e(h.due_raw)}" every week, so it rolls forward on its own.'
    return f'<div class="note note-slip">Due date has moved: {path}.{why}</div>'


def _item_card(b, item, show_effort):
    c = item.commitment
    h = _hist(b, c)
    badges = "".join(f'<span class="badge badge-{f}">{FLAG_LABELS[f]}</span>' for f in item.flags)
    if show_effort and item.effort:
        badges += f'<span class="effort effort-{item.effort.lower()}">{item.effort} effort</span>'
    badges += _history_badge(h)

    due = _fmt_date(c.due_date)
    if c.due_date_approx and c.due_date:
        due = f'≈ {due} <span class="approx">(written as "{_e(c.due_date_raw)}")</span>'

    reasons = "".join(f"<li>{_e(r)}</li>" for r in item.importance_reasons + item.urgency_reasons)
    reasons_html = f'<ul class="reasons">{reasons}</ul>' if reasons else ""

    extra = _due_moves(h)
    if item.blocks:
        blocked = "; ".join(f"{_e(_short(x.description))} ({_e(x.owner)})" for x in item.blocks)
        extra += f'<div class="note note-blocks">Holding up: {blocked}</div>'
    if item.conflict_partners:
        others = "; ".join(f"{_e(p.unit)}: {_e(_short(p.description))}, due {_fmt_date(p.due_date)}"
                           for p in item.conflict_partners)
        extra += f'<div class="note note-conflict">Same owner also has: {others}</div>'

    return f"""
      <li class="item">
        <div class="item-head">{_unit_tag(c.unit)}<span class="owner">{_e(c.owner)}</span>{badges}</div>
        <div class="desc">{_e(c.description)}</div>
        <div class="meta">Due {due} · last touched {_fmt_date(c.last_updated)}</div>
        {reasons_html}
        {extra}
      </li>"""


def _quadrant(b, name):
    items = b.quadrants[name]
    slug, subtitle = QUADRANT_META[name]
    show_effort = name == QUADRANT_NEEDS_DECISION_NOW
    if items:
        body = '<ul class="items">' + "".join(_item_card(b, i, show_effort) for i in items) + "</ul>"
    else:
        body = '<p class="empty">Nothing here this week.</p>'
    head = f'<h3>{_e(name)}</h3><span class="count">{len(items)}</span>'
    if name == QUADRANT_OMIT:
        return f"""
    <details class="quadrant quadrant-{slug}">
      <summary><span class="quadrant-head">{head}</span><span class="subtitle">{subtitle}</span></summary>
      {body}
    </details>"""
    return f"""
    <div class="quadrant quadrant-{slug}">
      <div class="quadrant-head">{head}</div>
      <div class="subtitle">{subtitle}</div>
      {body}
    </div>"""


def _summary(b):
    top = len(b.quadrants[QUADRANT_NEEDS_DECISION_NOW])
    misses = [r.unit_name for r in b.customer_health if r.triggered]
    miss_text = _plural(len(misses), "customer-rating miss", "customer-rating misses")
    parts = [f"<strong>{_plural(top, 'item')}</strong> need{'s' if top == 1 else ''} you now"]
    if b.conflicts:
        parts.append(f"<strong>{_plural(len(b.conflicts), 'owner conflict')}</strong>")
    if misses:
        parts.append(f"<strong>{miss_text}</strong> ({_e(', '.join(misses))})")
    if b.needs_deadline_items:
        parts.append(f"<strong>{_plural(len(b.needs_deadline_items), 'item')}</strong> with no deadline")
    line = " · ".join(parts)
    comp = b.comparison
    if comp and comp.previous_week:
        new = comp.count("new") + comp.count("returned")
        line += (f'<div class="summary-history">Since {_day(comp.previous_week)}: '
                 f'<strong>{new} new</strong>, <strong>{comp.count("running")} carried over</strong>, '
                 f'<strong>{len(comp.closed)} closed</strong>.</div>')
    elif comp:
        line += '<div class="summary-history">First week tracked, so nothing to compare against yet.</div>'
    return f'<div class="summary">{line}</div>'


def _data_check_top(b):
    notes = []
    if b.unresolved_owners:
        names = ", ".join(f"{_e(n)} ({_e(u)})" for n, u in b.unresolved_owners)
        notes.append(f"Owner names not in the alias table: <strong>{names}</strong>. A conflict "
                     f"involving them can't be seen until someone adds them to the table.")
    if b.comparison and b.comparison.duplicate_titles:
        dupes = ", ".join(f"{_e(t)} ({_e(u)})" for u, t in b.comparison.duplicate_titles)
        notes.append(f"Two items share a title, so their history can't be told apart: {dupes}.")
    if not notes:
        return ""
    return '<div class="check">' + "<br>".join(notes) + "</div>"


def _week_nav(weeks, current):
    if not weeks:
        return ""
    links = []
    for w, href in weeks:
        if w == current:
            links.append(f'<strong aria-current="page">{_day(w)}</strong>')
        else:
            links.append(f'<a href="{_e(href)}">{_day(w)}</a>')
    return '<nav class="weeks">Week ending: ' + " · ".join(links) + "</nav>"


def _closed(b):
    comp = b.comparison
    if not comp or not comp.previous_week:
        return ""
    if not comp.closed:
        body = '<p class="empty">Nothing flagged last week has closed.</p>'
    else:
        order = {"dropped": 0, "done": 1, "cleared": 2}
        rows = ""
        for x in sorted(comp.closed, key=lambda x: order[x.outcome]):
            cls, label = CLOSED_CHIPS[x.outcome]
            c = x.now or x.before
            ran = ("Flagged last week." if x.weeks_flagged == 1
                   else f"Flagged {x.weeks_flagged} weeks running before this.")
            rows += f"""
      <li class="item closed-{cls}">
        <div class="item-head"><span class="chip chip-{cls}">{label}</span>{_unit_tag(c.unit)}<span class="owner">{_e(c.owner)}</span></div>
        <div class="desc">{_e(c.description)}</div>
        <div class="meta">{_e(x.detail)} {ran}</div>
      </li>"""
        body = f'<ul class="items">{rows}</ul>'
    return f"""
  <section>
    <h2>Closed since {_day(comp.previous_week)}</h2>
    <p class="section-note">Flagged last week, not flagged this week. "Removed, not done" means the item
    disappeared from its unit's tracker without ever being marked done: worth one question.</p>
    {body}
  </section>"""


def _conflicts(b):
    if not b.conflicts:
        return ""
    rows = ""
    for p in b.conflicts:
        gap = "due the same day" if p.days_apart == 0 else f"due dates {_plural(p.days_apart, 'day')} apart"
        rows += f"""
      <li class="conflict-pair">
        <div class="conflict-owner">{_e(p.owner)} <span class="meta">{gap}</span></div>
        <div class="conflict-side">{_unit_tag(p.a.unit)} {_e(p.a.description)} <span class="meta">due {_fmt_date(p.a.due_date)}</span></div>
        <div class="conflict-side">{_unit_tag(p.b.unit)} {_e(p.b.description)} <span class="meta">due {_fmt_date(p.b.due_date)}</span></div>
      </li>"""
    return f"""
  <section>
    <h2>Owner conflicts</h2>
    <p class="section-note">One person, two open items, due within a day of each other. A bandwidth
    question for you to settle. Nothing here has been reassigned.</p>
    <ul class="conflicts">{rows}</ul>
  </section>"""


def _health_label(r):
    if r is None:
        return "no data", "none"
    if r.triggered:
        return "Miss", "miss"
    if r.low_sample:
        return "Not enough data", "lowsample"
    if r.rating is not None and r.target is not None and r.rating >= r.target:
        return "On target", "ok"
    return "Within tolerance", "ok"


def _num(v, fmt):
    return fmt.format(v) if v is not None else "not reported"


def _customer_health(b):
    prev = b.comparison.prev_health if b.comparison else {}
    rows = ""
    for r in b.customer_health:
        label, status = _health_label(r)
        last = ""
        if prev:
            p = prev.get(r.unit_name)
            p_label, p_status = _health_label(p)
            p_rating = f"{p.rating:.2f}" if p and p.rating is not None else ""
            last = f'<td class="last">{p_rating} <span class="last-{p_status}">{p_label}</span></td>'
        rows += f"""
        <tr>
          <td>{_e(r.unit_name)}</td>
          <td>{_num(r.rating, '{:.2f}')}</td>
          <td>{_num(r.target, '{:.2f}')}</td>
          <td>{_num(r.count, '{:,.0f}')}</td>
          <td><span class="badge badge-health-{status}">{label}</span></td>
          {last}
          <td class="why">{_e(r.reason)}</td>
        </tr>"""
    last_head = "<th>Last week</th>" if prev else ""
    return f"""
  <section>
    <h2>Customer ratings vs. target</h2>
    <p class="section-note">Judged on this week alone. A unit counts as a miss when it is more than
    {RATING_MISS_MARGIN} below its own target and logged at least {MIN_RATED_SAMPLE} rated interactions.
    A miss raises the priority of that unit's items above. Wasla Central has no customer rating.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Unit</th><th>Rating</th><th>Target</th><th>Rated</th><th></th>{last_head}<th>Why</th></tr></thead>
      <tbody>{rows}</tbody>
    </table></div>
  </section>"""


def _needs_deadline(b):
    if not b.needs_deadline_items:
        return ""
    rows = ""
    for c in b.needs_deadline_items:
        due = f'written as "{_e(c.due_date_raw)}"' if c.due_date_raw else "not set"
        rows += f"""
      <li class="item">
        <div class="item-head">{_unit_tag(c.unit)}<span class="owner">{_e(c.owner)}</span>{_history_badge(_hist(b, c))}</div>
        <div class="desc">{_e(c.description)}</div>
        <div class="meta">Due {due} · last touched {_fmt_date(c.last_updated)}</div>
      </li>"""
    return f"""
  <section>
    <h2>Needs a deadline set</h2>
    <p class="section-note">No usable due date, so urgency can't be judged. Listed so a date gets set,
    not quietly treated as "not urgent".</p>
    <ul class="items">{rows}</ul>
  </section>"""


def render(b, weeks=None):
    """weeks: optional [(week_ending, href)] for the week switcher."""
    grid = "".join(_quadrant(b, q) for q in
                   (QUADRANT_NEEDS_DECISION_NOW, QUADRANT_ON_YOUR_RADAR,
                    QUADRANT_FLAG_DONT_ESCALATE, QUADRANT_OMIT))
    if isinstance(b.week_ending, date):
        week = _fmt_date(b.week_ending)
    else:
        week = _e(b.week_ending or "unknown")
    alias_line = "" if b.unresolved_owners else \
        "<p>Every owner name this week matched the reviewed alias table.</p>"

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wasla Group briefing, week ending {week}</title>
<style>{_CSS}</style>
</head>
<body>
<div class="page">
  <header>
    <div class="eyebrow">Chief of Staff · Weekly briefing</div>
    <h1>Wasla Group</h1>
    <div class="header-meta">For the Group CEO · week ending {week} · scored as of {_fmt_date(b.today)}</div>
    {_week_nav(weeks, b.week_ending)}
    <div class="fiction">Fictional company and data, built to demonstrate a deterministic briefing engine.
    Not a production tool.</div>
    {_summary(b)}
    {_data_check_top(b)}
  </header>

  <section>
    <h2>Priorities</h2>
    <p class="section-note">Only items a rule flagged appear here: overdue, stale, in an owner conflict,
    or waiting on a decision. Each is placed by importance and urgency, with the reasons listed on the
    card. Nothing has been resolved or decided on your behalf.</p>
    <div class="grid">{grid}</div>
  </section>
  {_closed(b)}
  {_conflicts(b)}
  {_customer_health(b)}
  {_needs_deadline(b)}

  <footer>
    <p>Rules engine, no AI model at runtime. Status-update prose is never scored: an item's
    last-updated date is trusted over how it is described. Items are matched from week to week by
    unit and title (the text before the first comma).</p>
    {alias_line}
  </footer>
</div>
</body>
</html>
"""


_CSS = """
:root {
  --bg: #f6f5f2; --panel: #fff; --ink: #1c1b19; --muted: #6b6862; --border: #e4e1d9;
  --needs: #b3441e; --radar: #93661a; --flag: #3a5a8c; --omit: #8a8578; --ok: #3f7d4f;
  --radius: 10px;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); line-height: 1.5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
.page { max-width: 1000px; margin: 0 auto; padding: 32px 16px 64px; }
.eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 12px; color: var(--muted); font-weight: 600; }
h1 { font-size: 30px; margin: 4px 0 4px; }
h2 { font-size: 19px; margin: 0 0 4px; }
h3 { font-size: 15px; margin: 0; }
.header-meta { color: var(--muted); font-size: 14px; }
nav.weeks { margin-top: 6px; font-size: 13px; color: var(--muted); }
nav.weeks a { color: var(--flag); }
nav.weeks strong { color: var(--ink); }
.fiction { margin: 12px 0; padding: 8px 12px; font-size: 12px; color: var(--muted);
  background: #eeeae0; border: 1px solid var(--border); border-radius: var(--radius); }
.summary { font-size: 15px; padding: 12px 14px; background: var(--panel); border: 1px solid var(--border);
  border-left: 4px solid var(--needs); border-radius: var(--radius); }
.summary-history { margin-top: 4px; font-size: 14px; color: var(--muted); }
.summary-history strong { color: var(--ink); }
.check { margin-top: 10px; padding: 10px 14px; font-size: 13px; background: #fbeee4;
  border: 1px solid #e8c9ab; border-radius: var(--radius); }
section { margin: 32px 0; }
.section-note { color: var(--muted); font-size: 13px; max-width: 70ch; margin: 0 0 14px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
.quadrant { background: var(--panel); border: 1px solid var(--border); border-top: 4px solid var(--omit);
  border-radius: var(--radius); padding: 14px; min-width: 0; }
.quadrant-needs { border-top-color: var(--needs); }
.quadrant-radar { border-top-color: var(--radar); }
.quadrant-flag { border-top-color: var(--flag); }
.quadrant-head { display: inline-flex; align-items: center; gap: 8px; }
.count { font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 0 8px; }
.subtitle { display: block; color: var(--muted); font-size: 12px; margin: 2px 0 10px; }
details.quadrant summary { cursor: pointer; list-style: none; }
details.quadrant summary::-webkit-details-marker { display: none; }
details.quadrant summary .quadrant-head::before { content: "▸"; color: var(--muted); }
details.quadrant[open] summary .quadrant-head::before { content: "▾"; }
.empty { color: var(--muted); font-size: 13px; font-style: italic; margin: 0; }
ul.items, ul.conflicts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.item { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: #fffefc; }
.item-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.unit-tag { font-size: 11px; font-weight: 600; color: var(--muted); background: var(--bg);
  border: 1px solid var(--border); border-radius: 4px; padding: 0 6px; white-space: nowrap; }
.owner { font-weight: 600; font-size: 14px; }
.desc { font-size: 14px; margin-bottom: 2px; overflow-wrap: anywhere; }
.meta { color: var(--muted); font-size: 12px; font-weight: 400; }
.approx { font-style: italic; }
ul.reasons { margin: 6px 0 0; padding-left: 18px; font-size: 12px; color: var(--muted); }
.note { margin-top: 6px; font-size: 12px; }
.note-conflict { color: var(--flag); }
.note-blocks { color: var(--needs); }
.note-slip { color: var(--radar); }
.badge { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; color: #fff; white-space: nowrap; }
.badge-decision-pending { background: var(--needs); }
.badge-overdue { background: #7a2e14; }
.badge-stale { background: var(--radar); }
.badge-conflict { background: var(--flag); }
.badge-health-ok { background: var(--ok); }
.badge-health-miss { background: var(--needs); }
.badge-health-lowsample { background: var(--omit); }
.hist { font-size: 11px; font-weight: 600; padding: 0 7px; border-radius: 999px; white-space: nowrap;
  border: 1px solid var(--border); color: var(--ink); background: var(--bg); }
.hist-new { color: var(--flag); border-color: var(--flag); background: #fff; }
.hist-back { color: var(--radar); border-color: var(--radar); background: #fff; }
.effort { font-size: 11px; border: 1px solid; border-radius: 999px; padding: 0 7px; white-space: nowrap; }
.effort-low { color: var(--ok); }
.effort-medium { color: var(--radar); }
.effort-high, .effort-unknown { color: var(--needs); }
.chip { font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 4px; white-space: nowrap; color: #fff; }
.chip-done { background: var(--ok); }
.chip-cleared { background: var(--omit); }
.chip-removed { background: var(--needs); }
.closed-removed { border-color: #e8c9ab; background: #fdf6f1; }
.conflict-pair { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
.conflict-owner { font-weight: 700; margin-bottom: 4px; }
.conflict-side { font-size: 13px; margin-top: 4px; }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
tbody tr:last-child td { border-bottom: 0; }
th { background: var(--bg); font-size: 11px; text-transform: uppercase; color: var(--muted); }
td.why { color: var(--muted); font-size: 12px; white-space: normal; min-width: 200px; }
td.last { color: var(--muted); font-size: 12px; }
.last-miss { color: var(--needs); font-weight: 600; }
footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; }
footer p { max-width: 72ch; }
"""
