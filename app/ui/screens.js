/* The screens around the briefing: the intro, setup for the reader's own
company, and adding a week's files. Everything here is HTML built from
state; main.js owns the state and the events.
*/
import { esc } from "./render.js";
import { FIELDS, applyMapping, mappingProblems, likelyMatches } from "./intake.js";

export const NEW = "__new";
const TIERS = [
  ["Flagship", "Matters most. Its items always count as important."],
  ["Core", "Important and steady."],
  ["Experimental", "A newer bet. Listed after Core inside each group."],
];
const AREA_KINDS = ["department", "business", "business line", "brand", "market", "region", "team", "portfolio company"];

export function intro({ hasOwn }) {
  return `
  <section class="intro">
    <div class="eyebrow">Chief of Staff · Weekly briefing</div>
    <h1>Every week, what needs the boss, and nothing else.</h1>
    <p class="lede">Your teams send their task lists. This page reads them and puts in front of your CEO only
    what needs them: work that is overdue, stalled, clashing for one person, or waiting on a decision. It
    flags. It never decides, reassigns or suggests.</p>
    <ul class="points">
      <li>Set up your areas once: departments, businesses or whatever you call them.</li>
      <li>Each week, drop in the files the teams sent. The page keeps the history: what is new, what keeps coming back, what quietly disappeared.</li>
      <li>Runs in your browser. Nothing you load leaves your computer. There is no server and no account.</li>
    </ul>
    <div class="intro-actions">
      <a class="primary big" href="#/setup">${hasOwn ? "Continue with your company" : "Set up for your company"}</a>
      <a class="secondary big" href="#/example">See an example</a>
    </div>
    <p class="meta">The example is a made-up company, Wasla Group, with four weeks of reports.</p>
  </section>`;
}

function tierSelect(name, value) {
  return `<select name="${name}">${TIERS.map(([t]) => `<option${t === value ? " selected" : ""}>${t}</option>`).join("")}</select>`;
}

/** draft: { company, areaKind, boss, cosEmail, areas: [{ name, tier }], owners: [{ name, email, spellings }] } */
export function setupScreen(draft, { firstTime, message }) {
  const areas = draft.areas.map((a, i) => `
      <li class="row">
        <input name="area-name-${i}" value="${esc(a.name)}" placeholder="e.g. Sales" aria-label="Name">
        ${tierSelect(`area-tier-${i}`, a.tier)}
        <button type="button" class="link" data-act="remove-area" data-i="${i}">Remove</button>
      </li>`).join("");
  const owners = draft.owners.map((o, i) => `
      <li class="row">
        <input name="owner-name-${i}" value="${esc(o.name)}" placeholder="Full name" aria-label="Name">
        <input name="owner-email-${i}" type="email" value="${esc(o.email)}" placeholder="Email" aria-label="Email">
        <input name="owner-spellings-${i}" value="${esc(o.spellings)}" placeholder="Other spellings, e.g. P. Nair" aria-label="Other spellings">
        <button type="button" class="link" data-act="remove-owner" data-i="${i}">Remove</button>
      </li>`).join("");
  return `
  <nav class="toolbar"><a href="#/">Back</a></nav>
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
        <span class="hint">Copied on every email the page drafts to an owner.</span></label>
    </fieldset>

    <fieldset>
      <legend>Your ${esc(draft.areaKind || "area")}s and how much each matters</legend>
      <ul class="tier-help">${TIERS.map(([t, d]) => `<li><strong>${t}</strong>: ${d}</li>`).join("")}</ul>
      <ul class="rows">${areas}</ul>
      <button type="button" data-act="add-area">Add another</button>
    </fieldset>

    <fieldset>
      <legend>Who owns work (optional now)</legend>
      <p class="hint">Add people now, or as they appear in the files: each new name gets a
      "same person as...?" question, never a guess. Emails let you draft emails to owners.</p>
      <ul class="rows">${owners}</ul>
      <button type="button" data-act="add-owner">Add a person</button>
    </fieldset>

    ${message ? `<p class="message" role="alert">${esc(message)}</p>` : ""}
    <div class="form-actions"><button type="submit" class="primary">Save setup</button></div>
  </form>`;
}

function preview(rows, kind) {
  if (!rows.length) return '<p class="meta">No rows read yet.</p>';
  const cols = FIELDS[kind].map((f) => f.key);
  return `<div class="table-wrap"><table class="preview">
    <thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${rows.slice(0, 3).map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>${rows.length > 3 ? `<p class="meta">and ${rows.length - 3} more rows</p>` : ""}`;
}

function tableCard(t, i, areas) {
  const m = t.mapping;
  const rows = applyMapping(t, m);
  const problems = mappingProblems(m, m.kind);
  const options = (field) => [`<option value="">(none)</option>`,
    ...t.headers.map((h) => `<option value="${esc(h)}"${m.columns[field] === h ? " selected" : ""}>${esc(h)}</option>`)].join("");
  const matching = t.template ? '<p class="ok">Matches the template.</p>' : `
      <p class="meta">${t.remembered ? "Matched the way you did last time. Check and change if needed." : "Match its columns to the template. The page remembers this for next time."}</p>
      <div class="match-grid">
        ${FIELDS[m.kind].map((f) => `
        <label>${esc(f.label)}${f.required ? " *" : ""}
          <select name="map-${i}-${f.key}">${options(f.key)}</select>
          ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}</label>`).join("")}
      </div>`;
  const areaPick = m.columns.area ? "" : `
      <label class="whole-file">This whole file is for
        <select name="area-${i}"><option value="">(pick one)</option>${areas.map((a) =>
          `<option${m.area === a.name ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>`;
  return `
    <li class="table-card">
      <div class="table-head"><strong>${esc(t.name)}</strong>
        <label>It holds <select name="kind-${i}">
          <option value="tasks"${m.kind === "tasks" ? " selected" : ""}>tasks</option>
          <option value="metrics"${m.kind === "metrics" ? " selected" : ""}>metrics</option></select></label>
        <button type="button" class="link" data-act="remove-table" data-i="${i}">Remove</button></div>
      ${matching}
      ${areaPick}
      ${problems.length ? `<ul class="problems">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : preview(rows, m.kind)}
    </li>`;
}

/** intake: { week, tables, ownerAnswers, areaAnswers, message }. questions: from main.js. */
export function addWeekScreen(intake, { setup, owners, questions, problems, existingWeek }) {
  const ownerQs = questions.owners.map((name) => {
    const ans = intake.ownerAnswers[name] ?? {};
    const likely = likelyMatches(name, owners);
    const rest = owners.filter((o) => !likely.includes(o));
    const opt = (o) => `<option value="${esc(o.name)}"${ans.as === o.name ? " selected" : ""}>${esc(o.name)}</option>`;
    return `
      <li class="question">
        <span>Is <strong>${esc(name)}</strong> the same person as someone you already have?</span>
        <select name="owner-as" data-name="${esc(name)}">
          <option value="">(choose)</option>
          ${likely.length ? `<optgroup label="Possibly">${likely.map(opt).join("")}</optgroup>` : ""}
          ${rest.length ? `<optgroup label="Everyone else">${rest.map(opt).join("")}</optgroup>` : ""}
          <option value="${NEW}"${ans.as === NEW ? " selected" : ""}>No, a new person</option>
        </select>
        ${ans.as === NEW ? `<input name="owner-email" type="email" data-name="${esc(name)}" value="${esc(ans.email ?? "")}" placeholder="Their email (optional)">` : ""}
      </li>`;
  }).join("");
  const areaQs = questions.areas.map((name) => {
    const ans = intake.areaAnswers[name] ?? {};
    return `
      <li class="question">
        <span><strong>${esc(name)}</strong> isn't one of your ${esc(setup.areaKind)}s.</span>
        <select name="area-as" data-name="${esc(name)}">
          <option value="">(choose)</option>
          ${setup.areas.map((a) => `<option value="${esc(a.name)}"${ans.as === a.name ? " selected" : ""}>Same as ${esc(a.name)}</option>`).join("")}
          <option value="${NEW}"${ans.as === NEW ? " selected" : ""}>Add it as a new ${esc(setup.areaKind)}</option>
        </select>
        ${ans.as === NEW ? tierSelect(`area-tier`, ans.tier ?? "Core").replace("<select ", `<select data-name="${esc(name)}" `) : ""}
      </li>`;
  }).join("");

  return `
  <nav class="toolbar"><a href="#/">Back</a> <a href="#/setup">Setup</a></nav>
  <section class="add-week">
    <h1>Add a week</h1>
    <p class="lede">Drop in whatever the teams sent: the template, an Excel file, a CSV in their own
    shape, or a table pasted from a spreadsheet. Nothing leaves your computer.</p>

    <div class="templates">
      <span>Want every ${esc(setup.areaKind)} to send the same thing?</span>
      <button type="button" data-act="download-template" data-file="tasks-template.csv">Tasks template</button>
      <button type="button" data-act="download-template" data-file="metrics-template.csv">Metrics template</button>
      <details><summary>What goes in them</summary>
        <p>Tasks: one row per task. <strong>status</strong> is Open, In progress, Waiting on decision or Done.
        For a decision, <strong>waiting_on</strong> says who it waits on (for example ${esc(setup.boss)}) and
        <strong>decision_type</strong> is Yes or no, Pick an option, or Open question. <strong>blocked_by</strong>
        names another task's title. Dates as YYYY-MM-DD; "next Tuesday" also works.</p>
        <p>Metrics: one row per ${esc(setup.areaKind)} (or per city or store, in <strong>segment</strong>) with
        its customer rating, target and how many ratings it is based on. Optional.</p>
      </details>
    </div>

    <label class="week-pick">Week ending <input type="date" name="week" value="${esc(intake.week)}"></label>
    ${existingWeek ? `<p class="meta">You already have this week. Files you add replace that week's rows for the same ${esc(setup.areaKind)}s; the rest stay.</p>` : ""}

    <div class="drop" data-drop>
      <p><strong>Drop files here</strong> or <label class="file-pick">choose files
        <input type="file" name="files" multiple accept=".csv,.tsv,.txt,.xlsx,.xls"></label></p>
      <details><summary>Or paste a table</summary>
        <textarea name="paste" rows="5" placeholder="Copy the cells in Excel or Google Sheets, including the header row, and paste here"></textarea>
        <button type="button" data-act="use-paste">Use pasted table</button>
      </details>
    </div>

    ${intake.tables.length ? `<ul class="tables">${intake.tables.map((t, i) => tableCard(t, i, setup.areas)).join("")}</ul>` : ""}
    ${ownerQs ? `<h2>New names</h2><p class="section-note">Each name is matched only when you say so. A wrong
      match could hide or invent a clash for one person.</p><ul class="questions">${ownerQs}</ul>` : ""}
    ${areaQs ? `<h2>Unknown ${esc(setup.areaKind)}s</h2><ul class="questions">${areaQs}</ul>` : ""}

    ${intake.message ? `<p class="message" role="alert">${esc(intake.message)}</p>` : ""}
    ${problems.length && intake.tables.length ? `<ul class="problems">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
    <div class="form-actions">
      <button type="button" class="primary" data-act="save-week"${problems.length ? " disabled" : ""}>Save this week</button>
    </div>
  </section>`;
}
