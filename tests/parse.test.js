/* The CSV reader. Not a scoring rule, so no row in docs/dataset_key.md, but
every rule depends on it reading the teams' files exactly.
*/
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCsv, csvRecords } from "../app/engine/parse.js";

test("quoted field keeps its commas", () => {
  assert.deepEqual(parseCsv('a,b\nx,"one, two"\n'), [["a", "b"], ["x", "one, two"]]);
});

test("doubled quotes inside a quoted field are one quote", () => {
  assert.deepEqual(parseCsv('a\n"say ""hi"""\n'), [["a"], ['say "hi"']]);
});

test("line break inside a quoted field stays in the field", () => {
  assert.deepEqual(parseCsv('a,b\n"line 1\nline 2",x\n'), [["a", "b"], ["line 1\nline 2", "x"]]);
});

test("windows line endings and blank lines", () => {
  assert.deepEqual(parseCsv("a,b\r\n\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
});

test("empty fields are kept, a missing last line break is fine", () => {
  assert.deepEqual(parseCsv("a,b,c\n1,,\n2,3,4"), [["a", "b", "c"], ["1", "", ""], ["2", "3", "4"]]);
});

test("byte order mark is dropped from the first header", () => {
  assert.deepEqual(csvRecords("﻿owner,due_date\nMina,\n").fields, ["owner", "due_date"]);
});

test("short row leaves missing fields undefined, blank fields empty", () => {
  const { rows } = csvRecords("owner,status,note\nMina,\nZayd\n");
  assert.deepEqual(rows, [{ owner: "Mina", status: "" }, { owner: "Zayd" }]);
});

test("tab separated text, as pasted from a spreadsheet", () => {
  assert.deepEqual(parseCsv("a\tb\n1, 2\t3\n", "\t"), [["a", "b"], ["1, 2", "3"]]);
});
