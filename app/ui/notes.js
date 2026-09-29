/* Notes on items: the CEO's questions and decisions, or the Chief of Staff's
own notes, each with the owner's reply once it comes back. The words are
the reader's. The page only stores them, shows them and drafts an email.

A note belongs to an item by its area and title, the same identity the
week-over-week history uses, so it stays with the item from week to week.
It shows from the week it was written onward.

A note: { id, area, title, label, owner, from, text, week, at, emailed, reply }
reply: { text, at } or null.
*/
import { fmtLong, parseIsoDate } from "../engine/dates.js";

export const NOTE_FROM = ["CEO", "Chief of Staff"];

export function newNote({ area, title, label, owner, from, text, week }) {
  return {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    area, title, label, owner,
    from: NOTE_FROM.includes(from) ? from : NOTE_FROM[0],
    text: text.trim(),
    week,
    at: new Date().toISOString(),
    emailed: false,
    reply: null,
  };
}

/** Notes for one item, written in or before the week being shown, oldest first. */
export function notesFor(notes, area, title, week) {
  return notes.filter((n) => n.area === area && n.title === title && n.week <= week);
}

/** Keep only well-formed notes, so a damaged backup can't break the page. */
export function cleanNotes(list) {
  if (!Array.isArray(list)) return [];
  const str = (v) => (typeof v === "string" ? v : "");
  return list
    .map((n) => (n && n.area == null && typeof n.unit === "string" ? { ...n, area: n.unit } : n))
    .filter((n) => n && typeof n.id === "string" && typeof n.area === "string"
      && typeof n.title === "string" && typeof n.text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(n.week))
    .map((n) => ({
      id: n.id, area: n.area, title: n.title,
      label: str(n.label) || n.title,
      owner: str(n.owner),
      from: NOTE_FROM.includes(n.from) ? n.from : NOTE_FROM[0],
      text: n.text, week: n.week, at: str(n.at),
      emailed: n.emailed === true,
      reply: n.reply && typeof n.reply.text === "string" ? { text: n.reply.text, at: str(n.reply.at) } : null,
    }));
}

/** A basic shape check, enough to catch a typo. */
export function isEmail(text) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(text ?? "");
}

/** A mailto: link that opens a draft in the reader's own email app. Nothing
is sent from the page. The body is the note and the facts on the card, no
more: the page adds no advice of its own. The Chief of Staff is copied,
unless they are the owner. */
export function emailDraft({ to, cc, owner, item, note, weekEnding, flags, areaKind = "area" }) {
  const c = item;
  const lines = [
    `Hi ${owner.split(" ")[0]},`,
    "",
    note.from === "CEO" ? `From the CEO: ${note.text}` : note.text,
    "",
    `Item: ${c.description}`,
    `${areaKind[0].toUpperCase()}${areaKind.slice(1)}: ${c.area}`,
    `Due: ${c.dueDate != null ? fmtLong(c.dueDate) : c.dueDateRaw || "not set"}`,
  ];
  if (flags.length) lines.push(`Flagged: ${flags.join(", ")}`);
  lines.push("", `From the weekly briefing, week ending ${fmtLong(parseIsoDate(weekEnding))}.`);
  const subject = `Briefing: ${c.description.split(",", 1)[0].trim()}`;
  const copy = isEmail(cc) && cc.toLowerCase() !== to.toLowerCase() ? `cc=${encodeURIComponent(cc)}&` : "";
  return `mailto:${encodeURIComponent(to)}?${copy}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
