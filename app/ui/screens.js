/* The screens around the CEO view: the intro, setup, tasks, and this week's
routine. Everything here is HTML built from state; main.js owns the state
and the events.
*/
import { esc, nav, link, backupBar } from "./render.js";
import { METRIC_SUGGESTIONS } from "../engine/config.js";
import { fmtLong, parseIsoDate } from "../engine/dates.js";
import { openTasksOf, setupSteps } from "./weekly.js";

const TIERS = [
  ["Flagship", "Matters most. Its items always count as important."],
  ["Core", "Important and steady."],
  ["Experimental", "A newer bet. Listed after Core inside each group."],
];
const AREA_KINDS = ["department", "business", "business line", "brand", "market", "region", "team", "portfolio company"];
const STATUSES = ["Open", "In progress", "Waiting on decision", "Done"];
const DECISIONS = ["", "Yes or no", "Pick an option", "Open question"];

const plural = (n, w) => `${n} ${n === 1 ? w : `${w}s`}`;
const opts = (values, current, label = (v) => v) =>
  values.map((v) => `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(label(v))}</option>`).join("");

export function intro({ hasOwn }) {
  return `
  <section class="intro">
    <div class="eyebrow">Chief of Staff · Weekly briefing</div>
    <h1>Every week, what needs the boss, and nothing else.</h1>
    <p class="lede">Set up your company's areas, who leads each, the numbers each one reports and who owns
    what work. Each week the page asks the leaders for their numbers and people for their task updates, and
    turns what comes back into one view for your CEO: metrics against target, and only the work that needs
    them. It flags. It never decides, reassigns or suggests.</p>
    <ul class="points">
      <li>All set up in the browser. No spreadsheets to build: the page makes each leader's and each person's sheet for you.</li>
      <li>Every Monday: one click per person to email the request, and a calendar reminder they get automatically. Back by Wednesday, uploaded in one go.</li>
      <li>Runs in your browser. Nothing you enter leaves your computer. There is no server and no account.</li>
    </ul>
    <div class="intro-actions">
      <a class="primary big" href="#/setup">${hasOwn ? "Continue with your company" : "Set up for your company"}</a>
      <a class="secondary big" href="#/example">See an example</a>
    </div>
    <p class="meta">The example is a made-up company, Wasla Group, with four weeks of reports.</p>
  </section>
  ${backupBar({ scope: "own", hasData: false })}`;
}

/** The first-run checklist, on a new company's screens until something has come back. */
export function checklist(own, scope, current) {
  if (scope !== "own") return "";
  const steps = setupSteps(own);
  if (steps.every((s) => s.done)) return "";
  const next = steps.findIndex((s) => !s.done);
  return `
  <ol class="checklist-steps" aria-label="Getting started">
    ${steps.map((s, i) => `<li class="${s.done ? "done" : i === next ? "next" : ""}">
      ${s.done ? "✓ " : ""}${i === next && s.screen !== current ? `<a href="${link(scope, s.screen)}">${esc(s.label)}</a>` : esc(s.label)}</li>`).join("")}
  </ol>`;
}

// --- Setup ------------------------------------------------------------------------

function metricRow(ai, mi, m) {
  const n = `m-${ai}-${mi}`;
  return `
        <li class="metric-row">
          <label class="mini">Metric <input name="${n}-name" value="${esc(m.name)}" list="metric-names" placeholder="e.g. Sales"></label>
          <label class="mini">Unit <input name="${n}-unit" value="${esc(m.unit)}" placeholder="e.g. AED or %"></label>
          <label class="mini">Weekly target <input name="${n}-target" value="${esc(m.target ?? "")}" inputmode="decimal" placeholder="e.g. 100000"></label>
          <select name="${n}-better" aria-label="Which way is good">${opts(["higher", "lower"], m.better, (v) => `${v[0].toUpperCase()}${v.slice(1)} is better`)}</select>
          <span class="margin">Miss when worse by more than
            <input name="${n}-margin" value="${esc(m.margin)}" inputmode="decimal" aria-label="Margin">
            <select name="${n}-marginKind" aria-label="Margin kind">${opts(["percent", "points"], m.marginKind, (v) => (v === "percent" ? "%" : "points"))}</select></span>
          <button type="button" class="link" data-act="remove-metric" data-a="${ai}" data-m="${mi}">Remove</button>
        </li>`;
}

function areaCard(a, i, kind) {
  const chosen = new Set(a.metrics.map((m) => m.name.toLowerCase()));
  const chips = METRIC_SUGGESTIONS.filter((s) => !chosen.has(s.name.toLowerCase()))
    .map((s) => `<button type="button" class="chip-add" data-act="suggest-metric" data-a="${i}" data-name="${esc(s.name)}">+ ${esc(s.name)}</button>`).join("");
  return `
    <li class="area-card">
      <div class="row">
        <input name="a-${i}-name" value="${esc(a.name)}" placeholder="Name, e.g. Sales" aria-label="${esc(kind)} name" class="area-name">
        <select name="a-${i}-tier" aria-label="Tier">${opts(TIERS.map(([t]) => t), a.tier)}</select>
        <button type="button" class="link" data-act="remove-area" data-a="${i}">Remove</button>
      </div>
      <div class="row">
        <input name="a-${i}-leader" value="${esc(a.leader.name)}" placeholder="Leader's name" aria-label="Leader's name">
        <input name="a-${i}-leaderEmail" type="email" value="${esc(a.leader.email)}" placeholder="Leader's email" aria-label="Leader's email">
      </div>
      <label class="mini sheet-link">Or read their numbers from a Google Sheet (optional)
        <input name="a-${i}-sheetLink" value="${esc(a.sheetLink ?? "")}" placeholder="Publish-to-web link, as CSV"></label>
      <p class="hint">Metrics the leader reports each week, each with a weekly target.</p>
      ${a.metrics.length ? `<ul class="metric-rows">${a.metrics.map((m, mi) => metricRow(i, mi, m)).join("")}</ul>` : ""}
      <div class="chips">${chips}<button type="button" class="chip-add" data-act="add-metric" data-a="${i}">+ Another metric</button></div>
    </li>`;
}

/** draft: { company, areaKind, boss, cosEmail, areas: [{ name, tier, leader, metrics }] } */
export function setupScreen(draft, { firstTime, message, scope, own }) {
  const kind = draft.areaKind || "area";
  return `
  ${firstTime ? '<nav class="toolbar"><a href="#/">Back</a></nav>' : nav("setup", scope)}
  ${checklist(own, scope, "setup")}
  <form class="setup" data-form="setup">
    <h1>${firstTime ? "Set up for your company" : "Setup"}</h1>
    <p class="lede">Once. You can change any of it later. Saved in this browser only.</p>

    <fieldset>
      <legend>Your company</legend>
      <label>Company name <input name="company" value="${esc(draft.company)}" placeholder="e.g. Acme Group"></label>
      <label>Who is the briefing for? <input name="boss" value="${esc(draft.boss)}" placeholder="CEO">
        <span class="hint">Their title. A decision waiting on this title counts as waiting on them.</span></label>
      <label>What do you call the parts of the company you report on?
        <input name="areaKind" list="area-kinds" value="${esc(draft.areaKind)}" placeholder="department">
        <datalist id="area-kinds">${AREA_KINDS.map((k) => `<option value="${k}">`).join("")}</datalist></label>
      <label>Your email, as Chief of Staff <input name="cosEmail" type="email" value="${esc(draft.cosEmail)}" placeholder="you@company.com">
        <span class="hint">Where leaders and people send their updates. Copied on every email the page drafts to an owner.</span></label>
    </fieldset>

    <fieldset>
      <legend>Your ${esc(kind)}s: who leads each, how much it matters, what it reports</legend>
      <p class="hint warn">A leader can keep their metrics sheet in Google Sheets instead of sending a file. To link
      it, they publish it to the web (File, Share, Publish to web, CSV). Publishing makes the sheet readable by
      anyone who has the link. For confidential numbers, have them send the Excel file instead.</p>
      <ul class="tier-help">${TIERS.map(([t, d]) => `<li><strong>${t}</strong>: ${d}</li>`).join("")}</ul>
      <datalist id="metric-names">${METRIC_SUGGESTIONS.map((m) => `<option value="${esc(m.name)}">`).join("")}</datalist>
      <ul class="area-cards">${draft.areas.map((a, i) => areaCard(a, i, kind)).join("")}</ul>
      <button type="button" data-act="add-area">Add another ${esc(kind)}</button>
    </fieldset>

    ${message ? `<p class="message" role="alert">${esc(message)}</p>` : ""}
    <div class="form-actions"><button type="submit" class="primary">Save setup</button>
      ${firstTime ? '<span class="meta">Next: the people who own work, and their tasks.</span>' : ""}</div>
  </form>
  ${backupBar({ scope, hasData: !firstTime })}`;
}

// --- Tasks ------------------------------------------------------------------------

const titleOf = (t) => t.task.split(",", 1)[0].trim();

/** The Blocked by choices: every other open task, by id, shown as "Title (Owner)". */
function blockerOptions(t, tasks) {
  const others = tasks.filter((x) => x.id !== t.id && x.task.trim() && x.status !== "Done");
  const known = others.some((x) => x.id === t.blocked_by);
  const options = [`<option value="">(nothing)</option>`, ...others.map((x) =>
    `<option value="${esc(x.id)}"${x.id === t.blocked_by ? " selected" : ""}>${esc(titleOf(x))} (${esc(x.owner)})</option>`)];
  // Written as a title (from a file), or pointing at a task that is done or gone.
  if (t.blocked_by && !known) {
    const done = tasks.find((x) => x.id === t.blocked_by);
    options.push(`<option value="${esc(t.blocked_by)}" selected>${esc(done ? `${titleOf(done)} (done)` : t.blocked_by)}</option>`);
  }
  return others.length || t.blocked_by ? `<select name="blocked_by" data-id="${esc(t.id)}">${options.join("")}</select>`
    : '<span class="hint">no other tasks yet</span>';
}

function taskRow(t, areas, people, tasks) {
  const a = (f) => `name="${f}" data-id="${esc(t.id)}"`;
  const waiting = t.status === "Waiting on decision";
  return `
        <li class="task-row${t.status === "Done" ? " done" : ""}">
          <input ${a("task")} value="${esc(t.task)}" placeholder="What the task is" aria-label="Task" class="task-text">
          <div class="task-fields">
            <label>Due <input type="date" ${a("due_date")} value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : "")}"></label>
            <label>Status <select ${a("status")}>${opts(STATUSES, t.status || "Open")}</select></label>
            <label>Area <select ${a("area")}>${opts(areas.map((x) => x.name), t.area)}</select></label>
            <label>Owner <select ${a("owner")}>${opts(people.map((p) => p.name), t.owner)}</select></label>
            ${waiting ? `<label>Waiting on <input ${a("waiting_on")} value="${esc(t.waiting_on)}" placeholder="e.g. CEO"></label>
            <label>Decision <select ${a("decision_type")}>${opts(DECISIONS, t.decision_type, (v) => v || "(type)")}</select></label>` : ""}
            <label>Blocked by ${blockerOptions(t, tasks)}</label>
            ${(() => {
              const metrics = areas.find((x) => x.name === t.area)?.metrics ?? [];
              return metrics.length ? `<label title="A miss on this metric makes the task important">Moves <select ${a("moves_metric")}>${opts(["", ...metrics.map((m) => m.name)],
                t.moves_metric, (v) => v || "(no metric)")}</select></label>` : "";
            })()}
            <span class="meta">last touched ${t.last_updated ? fmtLong(parseIsoDate(t.last_updated)) : "never"}</span>
            <button type="button" class="link" data-act="delete-task" data-id="${esc(t.id)}">Delete</button>
          </div>
        </li>`;
}

/** own: the reader's workspace. draftPerson: the add-a-person form's values. */
export function tasksScreen(own, { message, matchQuestion, scope }) {
  const { setup, people, tasks } = own;
  const cards = people.map((p, i) => {
    const mine = tasks.filter((t) => t.owner === p.name);
    return `
    <li class="person-card">
      <div class="row person-head">
        <input name="p-${i}-name" value="${esc(p.name)}" aria-label="Name" class="person-name">
        <input name="p-${i}-email" type="email" value="${esc(p.email)}" placeholder="Email" aria-label="Email">
        <select name="p-${i}-area" aria-label="Their ${esc(setup.areaKind)}">${opts(["", ...setup.areas.map((a) => a.name)], p.area, (v) => v || `(${setup.areaKind})`)}</select>
        <button type="button" class="link" data-act="remove-person" data-p="${i}">Remove</button>
      </div>
      <details class="sheet-link"${p.sheetLink ? " open" : ""}><summary>${p.sheetLink ? "Tasks read from a Google Sheet" : "Read their tasks from a Google Sheet"}</summary>
        <input name="p-${i}-sheetLink" value="${esc(p.sheetLink ?? "")}" placeholder="Publish-to-web link, as CSV" aria-label="Google Sheet link">
        <span class="hint warn">Their tasks sheet, uploaded to Google Sheets and published to the web as CSV.
        Anyone with the link can read it; for confidential work, use the Excel file.</span>
      </details>
      ${mine.length ? `<ul class="task-rows">${mine.map((t) => taskRow(t, setup.areas, people, tasks)).join("")}</ul>` : '<p class="meta">No tasks yet.</p>'}
      <button type="button" data-act="add-task" data-p="${i}">Add a task for ${esc(p.name.split(" ")[0])}</button>
    </li>`;
  }).join("");
  return `
  ${nav("tasks", scope)}
  ${checklist(own, scope, "tasks")}
  <section class="tasks">
    <h1>People and their tasks</h1>
    <p class="lede">Everyone who owns work, and what they own. Changes save as you go. Each person can also
    update their own sheet from <a href="${link(scope, "week")}">This week</a>, and you upload it.</p>
    ${message ? `<p class="message" role="alert">${esc(message)}</p>` : ""}
    <ul class="person-cards">${cards}</ul>
    <form class="add-person" data-form="add-person">
      <h2>Add a person</h2>
      <div class="row">
        <input name="name" placeholder="Full name" aria-label="Full name" required>
        <input name="email" type="email" placeholder="Email" aria-label="Email">
        <select name="area" aria-label="Their ${esc(setup.areaKind)}">${opts(["", ...setup.areas.map((a) => a.name)], "", (v) => v || `(${setup.areaKind})`)}</select>
        <button type="submit">Add</button>
      </div>
      ${matchQuestion ?? ""}
    </form>
    <div class="form-actions"><a class="primary" href="${link(scope, "week")}">Next: this week</a></div>
  </section>
  ${backupBar({ scope, hasData: true })}`;
}

/** "Is X the same person as Y?", asked before a similar name is added. */
export function sameNameQuestion(name, matches) {
  return `
      <div class="question" role="alert">
        <span>Is <strong>${esc(name)}</strong> the same person as ${matches.map((m) => `<strong>${esc(m.name)}</strong>`).join(" or ")}?</span>
        ${matches.map((m) => `<button type="button" data-act="same-person" data-name="${esc(name)}" data-as="${esc(m.name)}">Yes, ${esc(m.name)}</button>`).join("")}
        <button type="button" data-act="new-person" data-name="${esc(name)}">No, a new person</button>
      </div>`;
}

// --- This week --------------------------------------------------------------------

function linkedCount(own) {
  return own.setup.areas.filter((a) => a.sheetLink).length + own.people.filter((p) => p.sheetLink).length;
}

/** week: the current week or null. uploads: files dropped this visit, read and checked. */
/** Going through every request in turn: one draft at a time, with that
person's sheet next to it. queue: { items, i } or null. */
function requestRun(queue, total) {
  if (!queue) {
    return total ? `
    <div class="run">
      <span><strong>${plural(total, "request")}</strong> still to send this week.</span>
      <button type="button" class="primary small" data-act="run-start">Go through them one by one</button>
    </div>` : '<div class="run"><span class="ok">Every request has come back.</span></div>';
  }
  if (queue.i >= queue.items.length) {
    const skipped = queue.items.length - queue.opened;
    return `<div class="run"><span class="ok">Done: ${plural(queue.opened, "draft")} opened${skipped ? `, ${skipped} skipped` : ""}.</span>
      <button type="button" class="link" data-act="run-stop">Close</button></div>`;
  }
  const r = queue.items[queue.i];
  return `
    <div class="run running" role="status">
      <span>Request ${queue.i + 1} of ${queue.items.length}: <strong>${esc(r.who)}</strong>, ${esc(r.what)}</span>
      ${r.kind === "tasks" ? `<button type="button" class="link" data-act="task-sheet" data-p="${r.index}">1. Download their sheet</button>` : ""}
      <button type="button" class="primary small" data-act="run-open">${r.kind === "tasks" ? "2. " : ""}Open the draft</button>
      <button type="button" class="link" data-act="run-skip">Skip</button>
      <button type="button" class="link" data-act="run-stop">Stop</button>
      ${r.kind === "tasks" ? '<span class="hint">Attach the sheet to the draft before sending.</span>' : ""}
    </div>`;
}

export function weekScreen(own, { suggestedWeek, message, uploads, cosEmail, googleLink, scope, queue, pending }) {
  const { setup, people } = own;
  const week = own.weeks.at(-1) ?? null;
  const kind = setup.areaKind;
  const start = `
    <form class="start-week" data-form="start-week">
      <label>Week ending <input type="date" name="week" value="${esc(suggestedWeek)}" required></label>
      <button type="submit" class="primary">${week ? "Start this week" : "Start the first week"}</button>
      <span class="hint">The week being reported on, usually the Sunday just gone.</span>
    </form>`;
  if (!week) {
    return `
  ${nav("week", scope)}
  ${checklist(own, scope, "week")}
  <section class="week">
    <h1>This week</h1>
    <p class="lede">Each week has the same rhythm: on Monday, ask each ${esc(kind)} leader for last week's numbers
    and each person for their task updates, due Wednesday. Upload what comes back. Then open the CEO view.</p>
    ${message ? `<p class="message" role="alert">${esc(message)}</p>` : ""}
    ${start}
  </section>
  ${backupBar({ scope, hasData: true })}`;
  }
  const w = week.weekEnding;
  const due = fmtLong(parseIsoDate(w) + 3);
  const leaderRows = setup.areas.map((a, i) => {
    const got = week.received.metrics.includes(a.name);
    const ready = a.leader.email && a.metrics.length;
    return `
        <tr>
          <td><strong>${esc(a.name)}</strong><br><span class="meta">${esc(a.leader.name || "No leader set")}</span></td>
          <td>${plural(a.metrics.length, "metric")}</td>
          <td class="actions">${ready ? `<a class="button-link" href="#" data-act="metric-request" data-a="${i}">Draft email</a>` : '<span class="meta">Add a leader email and metrics in Setup</span>'}
            ${a.metrics.length ? `<button type="button" class="link" data-act="metric-sheet" data-a="${i}">Their sheet (.xlsx)</button>` : ""}</td>
          <td>${got ? '<span class="ok">Received</span>' : '<span class="meta">Waiting</span>'}</td>
        </tr>`;
  }).join("");
  const personRows = people.map((p, i) => {
    const got = week.received.tasks.includes(p.name);
    return `
        <tr>
          <td><strong>${esc(p.name)}</strong><br><span class="meta">${esc(p.area)}</span></td>
          <td>${plural(openTasksOf(own, p).length, "open task")}</td>
          <td class="actions">${p.email ? `<a class="button-link" href="#" data-act="task-request" data-p="${i}">Draft email</a>` : '<span class="meta">Add their email in Tasks</span>'}
            <button type="button" class="link" data-act="task-sheet" data-p="${i}">Their sheet (.xlsx)</button></td>
          <td>${got ? '<span class="ok">Received</span>' : '<span class="meta">Waiting</span>'}</td>
        </tr>`;
  }).join("");
  const uploadList = uploads.length ? `
      <ul class="uploads">${uploads.map((u, i) => `
        <li class="upload ${u.error ? "bad" : ""}">
          <strong>${esc(u.name)}</strong>: ${esc(u.summary)}
          ${u.detail ? `<ul class="changes-list">${u.detail.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
          ${u.error || u.applied ? "" : `<button type="button" class="primary small" data-act="apply-upload" data-i="${i}">Apply</button>`}
          ${u.applied ? '<span class="ok">Applied</span>' : ""}
        </li>`).join("")}</ul>` : "";
  return `
  ${nav("week", scope)}
  ${checklist(own, scope, "week")}
  <section class="week">
    <h1>Week ending ${fmtLong(parseIsoDate(w))}</h1>
    <p class="lede">Ask on Monday, back by ${due}. Drafts open in your own email app; nothing is sent from
    this page. Attach each person's sheet to their email; a leader's sheet is the same every week.</p>
    ${message ? `<p class="message" role="alert">${esc(message)}</p>` : ""}

    ${requestRun(queue, pending)}

    <h2>1. Numbers from each ${esc(kind)} leader</h2>
    <div class="table-wrap"><table class="checklist"><tbody>${leaderRows}</tbody></table></div>

    <h2>2. Task updates from each person</h2>
    ${people.length ? `<div class="table-wrap"><table class="checklist"><tbody>${personRows}</tbody></table></div>`
      : `<p class="meta">No people yet. Add them in <a href="${link(scope, "tasks")}">Tasks</a>.</p>`}

    <div class="reminder">
      <strong>Reminder every Monday, set once.</strong> A recurring calendar event inviting every leader and
      person: "send last week's numbers and task updates to ${esc(cosEmail || "the Chief of Staff")} by Wednesday".
      <div class="reminder-actions">
        <a class="button-link" href="${esc(googleLink)}" target="_blank" rel="noopener">Add to Google Calendar</a>
        <button type="button" class="link" data-act="reminder-ics">Calendar file for Outlook or Apple (.ics)</button>
      </div>
      <span class="hint">Google Calendar opens with the event filled in; nothing is created until you save it there.</span>
    </div>

    <h2>3. Upload what came back</h2>
    ${linkedCount(own) ? `<div class="linked">
      <span>${plural(linkedCount(own), "sheet")} ${linkedCount(own) === 1 ? "is" : "are"} linked from Google Sheets.</span>
      <button type="button" data-act="fetch-linked">Fetch linked sheets</button>
    </div>` : ""}
    <div class="drop" data-drop>
      <p><strong>Drop the returned sheets here</strong> or <label class="file-pick">choose files
        <input type="file" name="files" multiple accept=".xlsx,.xls,.csv"></label></p>
      <p class="hint">Any mix of leaders' and people's sheets. Each is checked before anything changes.</p>
    </div>
    ${uploadList}

    <div class="form-actions"><a class="primary" href="${link(scope, "briefing")}">Open the CEO view</a></div>

    <details class="next-week"><summary>Start the next week</summary>${start}</details>
  </section>
  ${backupBar({ scope, hasData: true })}`;
}
