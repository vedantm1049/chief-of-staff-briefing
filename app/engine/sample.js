/* Reads a data folder laid out like data/: manifest.json, the owner table,
and weeks/<week_ending>/<area>/tasks.csv and metrics.csv. `read(path)` does
the actual reading, a fetch in the browser or a file read in the tests, and
returns the file's text.

Returns { aliasText, weeks: [{ weekEnding, tasks, metrics }] }, ready for
buildHistory.
*/
import { csvRecords } from "./parse.js";

export async function loadDataFolder(read) {
  const manifest = JSON.parse(await read("manifest.json"));
  const aliasText = await read(manifest.alias_table);
  const weeks = await Promise.all(Object.entries(manifest.weeks).map(async ([weekEnding, areas]) => {
    const week = { weekEnding, tasks: [], metrics: [] };
    for (const [folder, names] of Object.entries(areas)) {
      for (const name of names) {
        const kind = name.replace(/\.csv$/, "");
        if (kind !== "tasks" && kind !== "metrics") continue;
        const { rows } = csvRecords(await read(`weeks/${weekEnding}/${folder}/${name}`));
        week[kind].push(...rows);
      }
    }
    return week;
  }));
  return { aliasText, weeks };
}
