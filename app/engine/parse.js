/* Turns file contents into rows. CSV is read by hand, as plain strings, so
nothing guesses types: "2026-10-02" stays text until the engine reads it as a
date. Excel goes through SheetJS, stored in app/vendor.
*/
import * as XLSX from "../vendor/xlsx-0.20.3.mjs";

/** Split CSV text into rows of fields. Handles quoted fields with commas,
line breaks and doubled quotes. Blank lines are skipped. */
export function parseCsv(text, delimiter = ",") {
  const src = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", quoted = false, i = 0, lineHasContent = false;

  const endField = () => { row.push(field); field = ""; };
  const endRow = () => {
    endField();
    if (lineHasContent) rows.push(row);
    row = []; lineHasContent = false;
  };

  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { quoted = true; lineHasContent = true; i++; continue; }
    if (ch === delimiter) { endField(); lineHasContent = true; i++; continue; }
    if (ch === "\r" || ch === "\n") {
      endRow();
      i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch; lineHasContent = true; i++;
  }
  if (field !== "" || row.length || lineHasContent) endRow();
  return rows;
}

/** CSV text to { fields, rows }, each row an object keyed by header. A short
row leaves its missing fields undefined, like a blank cell that never existed. */
export function csvRecords(text, delimiter = ",") {
  const [header = [], ...body] = parseCsv(text, delimiter);
  const fields = header.map((h) => h.trim());
  const rows = body.map((cells) => {
    const out = {};
    fields.forEach((f, i) => { if (i < cells.length) out[f] = cells[i]; });
    return out;
  });
  return { fields, rows };
}

/** Excel bytes to { tab name: [row objects] }, tabs in workbook order. Blank
cells become null, dates become Date objects. */
export function readWorkbook(bytes) {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const out = {};
  for (const name of wb.SheetNames) {
    out[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
  }
  return out;
}
