/* Owner alias resolution, status normalization and inference, and free-text
due-date parsing. Plain functions against stated fields, no AI model.
*/
import {
  DONE_STATUS_VALUES,
  DONE_TEXT_HINTS,
  OPEN_TEXT_HINTS,
  CLOSED_TRIGGER_PATTERNS,
  PRINCIPAL_PATTERNS,
} from "./config.js";
import { csvRecords } from "./parse.js";
import { parseIsoDate, weekday } from "./dates.js";

const WEEKDAYS = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

/* The offline, human-reviewed alias table (data contract section 5).
The engine only reads it. It never fuzzy-matches names on its own, so a
name the table has never seen is reported, not guessed at.
*/
export class AliasTable {
  /** rows: [{ raw_name, unit, normalized_owner, email }]. email is optional. */
  constructor(rows) {
    this.byNameAndUnit = new Map();
    this.emails = new Map();   // canonical owner -> email, the first one listed
    const byName = new Map();
    for (const row of rows) {
      const raw = (row.raw_name ?? "").trim();
      const unit = (row.unit ?? "").trim();
      const canonical = (row.normalized_owner ?? "").trim();
      const email = (row.email ?? "").trim();
      if (email && !this.emails.has(canonical)) this.emails.set(canonical, email);
      this.byNameAndUnit.set(`${raw}\u0000${unit}`, canonical);
      if (!byName.has(raw)) byName.set(raw, new Set());
      byName.get(raw).add(canonical);
    }
    // A raw name alone is only usable when every row for it agrees.
    this.byName = new Map();
    for (const [raw, set] of byName) if (set.size === 1) this.byName.set(raw, [...set][0]);
    this.unresolvedKeys = new Map();   // "raw\0unit" -> [raw, unit], seen but not in the table
  }

  static fromCsv(text) {
    return new AliasTable(csvRecords(text).rows);
  }

  resolve(rawName, unit) {
    const raw = (rawName ?? "").trim();
    const key = `${raw}\u0000${unit}`;
    if (this.byNameAndUnit.has(key)) return this.byNameAndUnit.get(key);
    if (this.byName.has(raw)) return this.byName.get(raw);
    this.unresolvedKeys.set(key, [raw, unit]);
    return raw;
  }

  /** [[raw name, unit]], sorted. */
  get unresolved() {
    return [...this.unresolvedKeys.values()].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));
  }
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Map a unit's status vocabulary onto "open", "done" or "pending_decision".
Handles Mart's inconsistent values ("done", "Done", "complete", blank).
Returns null when blank, so the caller can fall back to reading the
description. */
export function normalizeStatus(rawStatus) {
  if (rawStatus == null) return null;
  const s = String(rawStatus).trim().toLowerCase();
  if (s === "" || s === "nan") return null;
  if (DONE_STATUS_VALUES.has(s)) return "done";
  if (s === "pending decision") return "pending_decision";
  return "open";
}

/** Wasla Table has no status column, by design. Read status out of the
description. Done hints win over open hints. */
export function inferStatusFromText(description) {
  const low = (description ?? "").toLowerCase();
  if (DONE_TEXT_HINTS.some((h) => low.includes(h))) return "done";
  if (OPEN_TEXT_HINTS.some((h) => low.includes(h))) return "open";
  return "open";   // untagged stays visible rather than silently vanishing
}

export function isDecisionPending(status, description) {
  if (status === "done") return false;
  if (status === "pending_decision") return true;
  const low = (description ?? "").toLowerCase();
  return CLOSED_TRIGGER_PATTERNS.some((p) => p.test(low));
}

export function isBlockedOnPrincipal(description, blockedBy) {
  const text = `${description} ${blockedBy}`.toLowerCase();
  return PRINCIPAL_PATTERNS.some((p) => p.test(text));
}

/** Return [day number or null, isApproximate].

Handles ISO dates, blanks, and Express's free text ("end of this week",
"next Tuesday", "in 2 weeks"). Free text that can't be read ("TBD",
"ASAP") returns [null, true]: the item has no usable deadline and is
flagged as needing one, rather than quietly scored as not urgent. */
export function parseDueDate(rawDueDate, today) {
  if (rawDueDate == null) return [null, false];
  const text = String(rawDueDate).trim();
  if (text === "" || text.toLowerCase() === "nan") return [null, false];

  const iso = parseIsoDate(text);
  if (iso != null) return [iso, false];

  const low = text.toLowerCase();
  let m = /^in (\d+) weeks?$/.exec(low);
  if (m) return [today + 7 * Number(m[1]), true];

  m = /^in (\d+) days?$/.exec(low);
  if (m) return [today + Number(m[1]), true];

  const toFriday = (((4 - weekday(today)) % 7) + 7) % 7;
  if (["end of this week", "end of the week", "eow"].includes(low)) return [today + toFriday, true];
  if (low === "end of next week") return [today + toFriday + 7, true];

  // "next Tuesday" is read as the nearest coming Tuesday. People use it both
  // ways; the page marks every parsed date as approximate and shows the raw
  // text, so the reader can see what the engine assumed.
  m = /^next (\w+)$/.exec(low);
  if (m && m[1] in WEEKDAYS) {
    const ahead = ((((WEEKDAYS[m[1]] - weekday(today)) % 7) + 7) % 7) || 7;
    return [today + ahead, true];
  }

  return [null, true];
}
