/* Owner alias resolution, status normalization and inference, and free-text
due-date parsing. Plain functions against stated fields, no AI model.
*/
import {
  DONE_STATUS_VALUES,
  DONE_TEXT_HINTS,
  OPEN_TEXT_HINTS,
  CLOSED_TRIGGER_PATTERNS,
  DECISION_STATUS_VALUES,
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
  /** rows: [{ raw_name, area, normalized_owner, email }]. email is optional. */
  constructor(rows) {
    this.byNameAndArea = new Map();
    this.emails = new Map();   // canonical owner -> email, the first one listed
    const byName = new Map();
    for (const row of rows) {
      const raw = (row.raw_name ?? "").trim();
      const area = (row.area ?? row.unit ?? "").trim();
      const canonical = (row.normalized_owner ?? "").trim();
      const email = (row.email ?? "").trim();
      if (email && !this.emails.has(canonical)) this.emails.set(canonical, email);
      this.byNameAndArea.set(`${raw}\u0000${area}`, canonical);
      if (!byName.has(raw)) byName.set(raw, new Set());
      byName.get(raw).add(canonical);
    }
    // A raw name alone is only usable when every row for it agrees.
    this.byName = new Map();
    for (const [raw, set] of byName) if (set.size === 1) this.byName.set(raw, [...set][0]);
    this.unresolvedKeys = new Map();   // "raw\0area" -> [raw, area], seen but not in the table
  }

  static fromCsv(text) {
    return new AliasTable(csvRecords(text).rows);
  }

  resolve(rawName, area) {
    const raw = (rawName ?? "").trim();
    const key = `${raw}\u0000${area}`;
    if (this.byNameAndArea.has(key)) return this.byNameAndArea.get(key);
    if (this.byName.has(raw)) return this.byName.get(raw);
    this.unresolvedKeys.set(key, [raw, area]);
    return raw;
  }

  /** [[raw name, area]], sorted. */
  get unresolved() {
    return [...this.unresolvedKeys.values()].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));
  }
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Map a status onto "open", "done" or "pending_decision". Takes the
template's words and the ones people type anyway ("complete", "done",
"Done"). Returns null when blank, so the caller can fall back to reading
the task text. */
export function normalizeStatus(rawStatus) {
  if (rawStatus == null) return null;
  const s = String(rawStatus).trim().toLowerCase();
  if (s === "" || s === "nan") return null;
  if (DONE_STATUS_VALUES.has(s)) return "done";
  if (DECISION_STATUS_VALUES.has(s)) return "pending_decision";
  return "open";
}

/** A blank status is read from the task text. Done hints win over open
hints. */
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

/** Is this decision waiting on the boss (the principal)? When waiting_on
says who it waits on, that settles it, whatever the task text says: a
question the CEO sent back to the owner waits on the owner. Only when
waiting_on is blank is the task text read. The boss's title is matched as
whole words, so "proceeds" or a loan's "principal" never count for a CEO. */
export function isBlockedOnPrincipal(description, waitingOn, boss = "CEO") {
  const words = String(boss).trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  if (!words) return false;
  const pattern = new RegExp(`(^|[^a-z0-9])${words}($|[^a-z0-9])`);
  const who = String(waitingOn ?? "").trim().toLowerCase();
  return who ? pattern.test(who) : pattern.test(String(description ?? "").toLowerCase());
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
