/* Reading files the reader drops on the page into tables, and helping them
tell whether a new name is someone they already have. Nothing here guesses
a person: likelyMatches only orders a list for the reader to choose from.
*/
import { parseCsv, readWorkbook } from "../engine/parse.js";

/** File contents to tables: [{ name, headers, rows: [objects] }]. A CSV or a
paste is one table; an Excel workbook gives one per non-empty sheet. */
export function readTables(fileName, content) {
  if (/\.(xlsx|xls)$/i.test(fileName)) {
    const sheets = readWorkbook(content);
    return Object.entries(sheets)
      .filter(([, rows]) => rows.length)
      .map(([sheet, rows]) => ({
        name: Object.keys(sheets).length > 1 ? `${fileName}, ${sheet}` : fileName,
        headers: Object.keys(rows[0]),
        rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cell(v)]))),
      }));
  }
  const text = String(content ?? "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const [header = [], ...body] = parseCsv(text, delimiter);
  const headers = header.map((h) => h.trim());
  if (!headers.some(Boolean)) return [];
  return [{
    name: fileName,
    headers,
    rows: body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]))),
  }];
}

/** An Excel cell as text. Dates become YYYY-MM-DD. */
function cell(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    // Round to the nearest day: Excel dates can land a few seconds off midnight.
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return String(v).trim();
}

/** People who might be the same person, for the reader to check: they share a
name word, or an initial matches and a name word matches. Only an ordering;
the reader decides. */
export function likelyMatches(name, people) {
  const words = (s) => s.toLowerCase().replace(/\./g, " ").split(/\s+/).filter(Boolean);
  const mine = words(name);
  return people.filter((o) => {
    const theirs = words(o.name);
    return mine.some((w) => w.length > 1 && theirs.includes(w))
      || mine.some((w) => w.length === 1 && theirs.some((t) => t.startsWith(w)) && mine.some((x) => x.length > 1 && theirs.includes(x)));
  });
}
