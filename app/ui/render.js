/* Turns one week's briefing into the page's HTML. Everything the teams wrote
is escaped before it goes on the page.

Page order: one-line summary, then the priorities with the top group first,
then what closed, conflicts, ratings and items with no deadline.
*/
import {
  QUADRANT_NEEDS_DECISION_NOW,
  QUADRANT_ON_YOUR_RADAR,
  QUADRANT_FLAG_DONT_ESCALATE,
  QUADRANT_OMIT,
  QUADRANT_ORDER,
} from "../engine/classify.js";
import { MIN_RATED_SAMPLE, RATING_MISS_MARGIN } from "../engine/config.js";
import { itemTitle } from "../engine/rules.js";
import { fmtLong, fmtShort, toIso, parseIsoDate } from "../engine/dates.js";
import { notesFor, emailDraft, NOTE_FROM } from "./notes.js";

const QUADRANT_META = {
  [QUADRANT_NEEDS_DECISION_NOW]: ["needs", "Important and urgent"],
  [QUADRANT_ON_YOUR_RADAR]: ["radar", "Important, not yet urgent"],
  [QUADRANT_FLAG_DONT_ESCALATE]: ["flag", "Urgent, not important"],
  [QUADRANT_OMIT]: ["omit", "Neither. Listed for audit, not for action"],
};

const FLAG_LABELS = {
  "decision-pending": "Decision pending",
  overdue: "Overdue",
  stale: "Stale",
  conflict: "Conflict",
};

const CLOSED_CHIPS = {
  dropped: ["removed", "Removed, not done"],
  done: ["done", "Done"],
  cleared: ["cleared", "Cleared"],
};

export function esc(s) {
  return s == null ? "" : String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function short(text, limit = 48) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[,;:]+$/, "") + "…";
}

function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

function ordinal(n) {
  const suffix = n % 100 >= 10 && n % 100 <= 20 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

function unitTag(unit, tiers) {
  return `<span class="unit-tag">${esc(unit)} · ${esc(tiers[unit] ?? "")}</span>`;
}

function hist(b, c) {
  return b.comparison?.items.get(c) ?? null;
}

function historyBadge(h) {
  if (!h || h.label === "baseline") return "";
  if (h.label === "new") return '<span class="hist hist-new">New this week</span>';
  if (h.label === "returned") return `<span class="hist hist-back">Back, last flagged ${fmtShort(h.lastFlagged)}</span>`;
  return `<span class="hist hist-running" title="Flagged every week since ${fmtShort(h.since)}">${ordinal(h.weeksRunning)} week running</span>`;
}

function dueMoves(h) {
  if (!h || h.dueDates.length < 2) return "";
  const path = h.dueDates.map(fmtShort).join(" → ");
  const why = h.dueRaw ? ` Written as "${esc(h.dueRaw)}" every week, so it rolls forward on its own.` : "";
  return `<div class="note note-slip">Due date has moved: ${path}.${why}</div>`;
}

function dueText(c) {
  if (c.edited?.dueFrom != null) {
    const from = c.edited.dueFrom ? `"${esc(c.edited.dueFrom)}"` : "no date";
    return `${fmtLong(c.dueDate)} <span class="yours">(you changed this from ${from})</span>`;
  }
  if (c.dueDateApprox && c.dueDate != null) {
    return `≈ ${fmtLong(c.dueDate)} <span class="approx">(written as "${esc(c.dueDateRaw)}")</span>`;
  }
  if (c.dueDate == null) return c.dueDateRaw ? `not usable, written as "${esc(c.dueDateRaw)}"` : "not set";
  return fmtLong(c.dueDate);
}

/** The two things a reader can change: tick it done, or set its due date. */
function editControls(c) {
  const label = c.description.split(",", 1)[0].trim();
  const attrs = `data-unit="${esc(c.unit)}" data-title="${esc(itemTitle(c.description))}" data-label="${esc(label)}"`;
  const value = c.dueDate != null ? toIso(c.dueDate) : "";
  return `
        <div class="edit">
          <label><input type="checkbox" data-act="done" ${attrs}> Mark done</label>
          <label>Due date <input type="date" data-act="due" value="${value}" ${attrs}></label>
        </div>`;
}

function noteEntry(n, ctx, item, flags) {
  const email = ctx.emails.get(n.owner);
  let action;
  if (!item) {
    action = "";
  } else if (email) {
    const href = emailDraft({ to: email, cc: ctx.cosEmail, owner: n.owner, item, note: n, weekEnding: ctx.week, flags });
    const copied = ctx.cosEmail && ctx.cosEmail.toLowerCase() !== email.toLowerCase()
      ? `<span class="meta">copies ${esc(ctx.cosEmail)}</span>` : "";
    action = `<a class="button-link" href="${esc(href)}" data-act="email" data-id="${esc(n.id)}">Draft email to ${esc(n.owner)}</a>${copied}`
      + (n.emailed ? '<span class="sent">Draft opened</span>' : "");
  } else {
    action = `<span class="meta">No email on file for ${esc(n.owner || "this owner")}.</span>`;
  }
  const reply = n.reply
    ? `<div class="reply"><div class="note-from">${esc(n.owner || "Owner")} replied</div><div class="note-text">${esc(n.reply.text)}</div>`
      + `<button type="button" class="link" data-act="delete-reply" data-id="${esc(n.id)}">Remove reply</button></div>`
    : `<details class="add-reply"><summary>Add ${esc(n.owner ? `${n.owner}'s` : "the")} reply</summary>
        <form data-form="reply" data-id="${esc(n.id)}">
          <textarea name="text" rows="2" required placeholder="Paste or sum up the reply"></textarea>
          <button type="submit">Save reply</button>
        </form></details>`;
  return `
          <li class="note-entry">
            <div><span class="note-from">${esc(n.from)}</span> <span class="meta">week ending ${fmtShort(parseIsoDate(n.week))}</span></div>
            <div class="note-text">${esc(n.text)}</div>
            <div class="note-actions">${action}
              <button type="button" class="link" data-act="delete-note" data-id="${esc(n.id)}">Delete note</button></div>
            ${reply}
          </li>`;
}

/** Notes on one item, and a form to add one. */
function notesBlock(c, flags, ctx) {
  const title = itemTitle(c.description);
  const label = c.description.split(",", 1)[0].trim();
  const list = notesFor(ctx.notes, c.unit, title, ctx.week);
  const entries = list.length ? `<ul class="note-list">${list.map((n) => noteEntry(n, ctx, c, flags)).join("")}</ul>` : "";
  const options = NOTE_FROM.map((f) => `<option>${esc(f)}</option>`).join("");
  return `
        <div class="notes">
          ${entries}
          <details class="add-note"><summary>Add a note or question</summary>
            <form data-form="note" data-unit="${esc(c.unit)}" data-title="${esc(title)}" data-label="${esc(label)}" data-owner="${esc(c.owner)}">
              <label>From <select name="from">${options}</select></label>
              <textarea name="text" rows="2" required placeholder="A question, a decision, or a note for the record"></textarea>
              <button type="submit">Save note</button>
            </form>
          </details>
        </div>`;
}

function itemCard(b, item, showEffort, tiers, ctx) {
  const c = item.commitment;
  const h = hist(b, c);
  let badges = item.flags.map((f) => `<span class="badge badge-${f}">${FLAG_LABELS[f]}</span>`).join("");
  if (showEffort && item.effort) badges += `<span class="effort effort-${item.effort.toLowerCase()}">${item.effort} effort</span>`;
  badges += historyBadge(h);

  const reasons = [...item.importanceReasons, ...item.urgencyReasons].map((r) => `<li>${esc(r)}</li>`).join("");
  let extra = dueMoves(h);
  if (item.blocks.length) {
    extra += `<div class="note note-blocks">Holding up: ${item.blocks
      .map((x) => `${esc(short(x.description))} (${esc(x.owner)})`).join("; ")}</div>`;
  }
  if (item.conflictPartners.length) {
    extra += `<div class="note note-conflict">Same owner also has: ${item.conflictPartners
      .map((p) => `${esc(p.unit)}: ${esc(short(p.description))}, due ${fmtLong(p.dueDate)}`).join("; ")}</div>`;
  }

  return `
      <li class="item">
        <div class="item-head">${unitTag(c.unit, tiers)}<span class="owner">${esc(c.owner)}</span>${badges}</div>
        <div class="desc">${esc(c.description)}</div>
        <div class="meta">Due ${dueText(c)} · last touched ${fmtLong(c.lastUpdated)}</div>
        ${reasons ? `<ul class="reasons">${reasons}</ul>` : ""}
        ${extra}
        ${editControls(c)}
        ${notesBlock(c, item.flags.map((f) => FLAG_LABELS[f]), ctx)}
      </li>`;
}

function quadrant(b, name, tiers, ctx) {
  const items = b.quadrants[name];
  const [slug, subtitle] = QUADRANT_META[name];
  const body = items.length
    ? `<ul class="items">${items.map((i) => itemCard(b, i, name === QUADRANT_NEEDS_DECISION_NOW, tiers, ctx)).join("")}</ul>`
    : '<p class="empty">Nothing here this week.</p>';
  const head = `<h3>${esc(name)}</h3><span class="count">${items.length}</span>`;
  if (name === QUADRANT_OMIT) {
    return `
    <details class="quadrant quadrant-${slug}">
      <summary><span class="quadrant-head">${head}</span><span class="subtitle">${subtitle}</span></summary>
      ${body}
    </details>`;
  }
  return `
    <div class="quadrant quadrant-${slug}">
      <div class="quadrant-head">${head}</div>
      <div class="subtitle">${subtitle}</div>
      ${body}
    </div>`;
}

function summary(b) {
  const top = b.quadrants[QUADRANT_NEEDS_DECISION_NOW].length;
  const misses = b.customerHealth.filter((r) => r.triggered).map((r) => r.unitName);
  const parts = [`<strong>${plural(top, "item")}</strong> need${top === 1 ? "s" : ""} you now`];
  if (b.conflicts.length) parts.push(`<strong>${plural(b.conflicts.length, "owner conflict")}</strong>`);
  if (misses.length) {
    parts.push(`<strong>${plural(misses.length, "customer-rating miss", "customer-rating misses")}</strong> (${esc(misses.join(", "))})`);
  }
  if (b.needsDeadlineItems.length) parts.push(`<strong>${plural(b.needsDeadlineItems.length, "item")}</strong> with no deadline`);
  let line = parts.join(" · ");
  const comp = b.comparison;
  if (comp?.previousWeek != null) {
    const fresh = comp.count("new") + comp.count("returned");
    line += `<div class="summary-history">Since ${fmtShort(comp.previousWeek)}: <strong>${fresh} new</strong>, `
      + `<strong>${comp.count("running")} carried over</strong>, <strong>${comp.closed.length} closed</strong>.</div>`;
  } else if (comp) {
    line += '<div class="summary-history">First week tracked, so nothing to compare against yet.</div>';
  }
  return `<div class="summary">${line}</div>`;
}

function dataCheck(b) {
  const notes = [];
  if (b.unresolvedOwners.length) {
    const names = b.unresolvedOwners.map(([n, u]) => `${esc(n)} (${esc(u)})`).join(", ");
    notes.push(`Owner names not in the alias table: <strong>${names}</strong>. A conflict involving them can't be seen until someone adds them to the table.`);
  }
  if (b.comparison?.duplicateTitles.length) {
    const dupes = b.comparison.duplicateTitles.map(([u, t]) => `${esc(t)} (${esc(u)})`).join(", ");
    notes.push(`Two items share a title, so their history can't be told apart: ${dupes}.`);
  }
  return notes.length ? `<div class="check">${notes.join("<br>")}</div>` : "";
}

function weekNav(briefings, current) {
  const links = briefings.map((b) => {
    const iso = toIso(b.weekEnding);
    return b === current
      ? `<button type="button" class="week current" aria-current="true" data-week="${iso}">${fmtShort(b.weekEnding)}</button>`
      : `<button type="button" class="week" data-week="${iso}">${fmtShort(b.weekEnding)}</button>`;
  }).join("");
  return `<nav class="weeks" aria-label="Week ending">Week ending ${links}</nav>`;
}

function closedSection(b, tiers) {
  const comp = b.comparison;
  if (comp?.previousWeek == null) return "";
  let body;
  if (!comp.closed.length) {
    body = '<p class="empty">Nothing flagged last week has closed.</p>';
  } else {
    const order = { dropped: 0, done: 1, cleared: 2 };
    body = `<ul class="items">${[...comp.closed].sort((x, y) => order[x.outcome] - order[y.outcome]).map((x) => {
      const [cls, label] = CLOSED_CHIPS[x.outcome];
      const c = x.now ?? x.before;
      const ran = x.weeksFlagged === 1 ? "Flagged last week." : `Flagged ${x.weeksFlagged} weeks running before this.`;
      return `
      <li class="item closed-${cls}">
        <div class="item-head"><span class="chip chip-${cls}">${label}</span>${unitTag(c.unit, tiers)}<span class="owner">${esc(c.owner)}</span></div>
        <div class="desc">${esc(c.description)}</div>
        <div class="meta">${esc(x.detail)} ${ran}</div>
      </li>`;
    }).join("")}</ul>`;
  }
  return `
  <section>
    <h2>Closed since ${fmtShort(comp.previousWeek)}</h2>
    <p class="section-note">Flagged last week, not flagged this week. "Removed, not done" means the item
    disappeared from its unit's tracker without ever being marked done.</p>
    ${body}
  </section>`;
}

function conflictsSection(b, tiers) {
  if (!b.conflicts.length) return "";
  const rows = b.conflicts.map((p) => {
    const gap = p.daysApart === 0 ? "due the same day" : `due dates ${plural(p.daysApart, "day")} apart`;
    return `
      <li class="conflict-pair">
        <div class="conflict-owner">${esc(p.owner)} <span class="meta">${gap}</span></div>
        <div class="conflict-side">${unitTag(p.a.unit, tiers)} ${esc(p.a.description)} <span class="meta">due ${fmtLong(p.a.dueDate)}</span></div>
        <div class="conflict-side">${unitTag(p.b.unit, tiers)} ${esc(p.b.description)} <span class="meta">due ${fmtLong(p.b.dueDate)}</span></div>
      </li>`;
  }).join("");
  return `
  <section>
    <h2>Owner conflicts</h2>
    <p class="section-note">One person, two open items, due within a day of each other. Nothing here has
    been reassigned.</p>
    <ul class="conflicts">${rows}</ul>
  </section>`;
}

function healthLabel(r) {
  if (!r) return ["no data", "none"];
  if (r.triggered) return ["Miss", "miss"];
  if (r.lowSample) return ["Not enough data", "lowsample"];
  if (r.rating != null && r.target != null && r.rating >= r.target) return ["On target", "ok"];
  return ["Within tolerance", "ok"];
}

function num(v, digits) {
  return v == null ? "not reported"
    : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function healthSection(b) {
  const prev = b.comparison?.prevHealth ?? {};
  const hasPrev = Object.keys(prev).length > 0;
  const rows = b.customerHealth.map((r) => {
    const [label, status] = healthLabel(r);
    let last = "";
    if (hasPrev) {
      const p = prev[r.unitName];
      const [pLabel, pStatus] = healthLabel(p);
      const pRating = p?.rating != null ? p.rating.toFixed(2) : "";
      last = `<td class="last">${pRating} <span class="last-${pStatus}">${pLabel}</span></td>`;
    }
    return `
        <tr>
          <td>${esc(r.unitName)}</td>
          <td>${num(r.rating, 2)}</td>
          <td>${num(r.target, 2)}</td>
          <td>${num(r.count, 0)}</td>
          <td><span class="badge badge-health-${status}">${label}</span></td>
          ${last}
          <td class="why">${esc(r.reason)}</td>
        </tr>`;
  }).join("");
  return `
  <section>
    <h2>Customer ratings vs. target</h2>
    <p class="section-note">Judged on this week alone. A unit counts as a miss when it is more than
    ${RATING_MISS_MARGIN} below its own target and logged at least ${MIN_RATED_SAMPLE} rated interactions.
    A miss raises the priority of that unit's items above. Wasla Central has no customer rating.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Unit</th><th>Rating</th><th>Target</th><th>Rated</th><th></th>${hasPrev ? "<th>Last week</th>" : ""}<th>Why</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

function needsDeadlineSection(b, tiers, ctx) {
  if (!b.needsDeadlineItems.length) return "";
  const rows = b.needsDeadlineItems.map((c) => `
      <li class="item">
        <div class="item-head">${unitTag(c.unit, tiers)}<span class="owner">${esc(c.owner)}</span>${historyBadge(hist(b, c))}</div>
        <div class="desc">${esc(c.description)}</div>
        <div class="meta">Due ${dueText(c)} · last touched ${fmtLong(c.lastUpdated)}</div>
        ${editControls(c)}
        ${notesBlock(c, ["No deadline"], ctx)}
      </li>`).join("");
  return `
  <section>
    <h2>Needs a deadline set</h2>
    <p class="section-note">No usable due date, so urgency can't be judged. Listed so a date gets set,
    not quietly treated as "not urgent".</p>
    <ul class="items">${rows}</ul>
  </section>`;
}

/** Notes whose item has no card this week: closed, cleared, or not flagged.
The item is looked up in this week's files so the email draft has facts. */
function otherNotesSection(b, shown, ctx) {
  const shownKeys = new Set(shown.map((c) => `${c.unit}\u0000${itemTitle(c.description)}`));
  const rest = ctx.notes.filter((n) => n.week <= ctx.week && !shownKeys.has(`${n.unit}\u0000${n.title}`));
  if (!rest.length) return "";
  const groups = new Map();
  for (const n of rest) {
    const k = `${n.unit}\u0000${n.title}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  }
  const rows = [...groups.values()].map((list) => {
    const n0 = list[0];
    const item = b.allCommitments.find((c) => c.unit === n0.unit && itemTitle(c.description) === n0.title) ?? null;
    const state = item ? (item.status === "done" ? "Done" : "Open, not flagged this week") : "Not in this week's files";
    return `
      <li class="item">
        <div class="item-head"><span class="unit-tag">${esc(n0.unit)}</span><span class="owner">${esc(n0.label)}</span>
          <span class="meta">${state}</span></div>
        <ul class="note-list">${list.map((n) => noteEntry(n, ctx, item, [])).join("")}</ul>
      </li>`;
  }).join("");
  return `
  <section>
    <h2>Notes on items not flagged this week</h2>
    <p class="section-note">Notes stay with their item from week to week. These items have no card this
    week, so their notes are kept here.</p>
    <ul class="items">${rows}</ul>
  </section>`;
}

/** The reader's changes for this week, each with a way to undo it. */
function yourChanges(weekEdits) {
  if (!weekEdits.length) return "";
  const rows = weekEdits.map((e) => {
    const what = [e.done ? "marked done" : "", e.due ? `due date set to ${fmtLong(parseIsoDate(e.due))}` : ""]
      .filter(Boolean).join(", ");
    return `
      <li class="change">
        <span><strong>${esc(e.unit)}</strong>, ${esc(e.label ?? e.title)}: ${what}.</span>
        <button type="button" class="link" data-act="undo" data-unit="${esc(e.unit)}" data-title="${esc(e.title)}">Undo</button>
      </li>`;
  }).join("");
  return `
  <section>
    <h2>Your changes this week</h2>
    <p class="section-note">Applied to this week only. When next week's files come in, they replace
    these: new data wins.</p>
    <ul class="changes">${rows}</ul>
  </section>`;
}

function storageBar(state) {
  const count = state.edits.length + state.notes.length;
  const status = state.saved
    ? `Your changes and notes are saved in this browser only. There is no server: nothing you do here
       leaves your computer. They stay in this one browser until you export a backup. An email draft opens
       in your own email app and is sent only if you send it.`
    : `This browser is blocking storage, so your changes will be lost when you close the page. Export a
       backup to keep them. Nothing you do here leaves your computer.`;
  return `
    <div class="storage" id="your-data">
      <p>${status}</p>
      <div class="storage-actions">
        <button type="button" data-act="export"${count ? "" : " disabled"}>Export backup</button>
        <button type="button" data-act="import">Import backup</button>
        ${count ? `<button type="button" class="link" data-act="reset">Clear all changes and notes</button>` : ""}
        <input type="file" accept="application/json,.json" data-act="import-file" hidden>
      </div>
      <form class="cos-email" data-form="cos-email">
        <label for="cos-email">Chief of Staff email, copied on every email draft</label>
        <div><input id="cos-email" name="email" type="email" required value="${esc(state.cosEmail)}">
        <button type="submit">Save</button></div>
      </form>
      ${state.message ? `<p class="message" role="status">${esc(state.message)}</p>` : ""}
    </div>`;
}

/** state: { briefings, current, tiers, edits, notes, cosEmail, weekEdits, saved, message } */
export function renderPage(state) {
  const { briefings, current: b, tiers } = state;
  const ctx = { notes: state.notes, week: toIso(b.weekEnding), emails: b.ownerEmails, cosEmail: state.cosEmail };
  const shown = [...[...b.classified.values()].map((i) => i.commitment), ...b.needsDeadlineItems];
  const week = fmtLong(b.weekEnding);
  const aliasLine = b.unresolvedOwners.length ? "" : "<p>Every owner name this week matched the reviewed alias table.</p>";
  return `
  <header>
    <div class="eyebrow">Chief of Staff · Weekly briefing</div>
    <h1>Wasla Group</h1>
    <div class="header-meta">For the Group CEO · week ending ${week} · scored as of ${fmtLong(b.today)}</div>
    ${weekNav(briefings, b)}
    <div class="fiction">Fictional company and data, built to show a rules-based briefing. Not a production tool.</div>
    <p class="privacy">You can mark items done, change due dates, and add notes and replies. All of it is
    saved in this browser only and never leaves your computer. <a href="#your-data">Backup and import</a>
    are at the bottom.</p>
    ${summary(b)}
    ${dataCheck(b)}
  </header>

  <section>
    <h2>Priorities</h2>
    <p class="section-note">Only items a rule flagged appear here: overdue, stale, in an owner conflict,
    or waiting on a decision. Each is placed by importance and urgency, with the reasons listed on the
    card. Nothing has been resolved or decided on your behalf.</p>
    <div class="grid">${QUADRANT_ORDER.map((q) => quadrant(b, q, tiers, ctx)).join("")}</div>
  </section>
  ${yourChanges(state.weekEdits)}
  ${closedSection(b, tiers)}
  ${conflictsSection(b, tiers)}
  ${healthSection(b)}
  ${needsDeadlineSection(b, tiers, ctx)}
  ${otherNotesSection(b, shown, ctx)}

  <footer>
    ${storageBar(state)}
    <p>Rules only, no AI model. Status-update prose is never scored: an item's last-updated date is
    trusted over how it is described. Items are matched from week to week by unit and title (the text
    before the first comma).</p>
    ${aliasLine}
    <p><a href="https://github.com/vedantm1049/chief-of-staff-briefing">Source and rules on GitHub</a></p>
  </footer>`;
}
