/* Reads a data folder laid out like data/: manifest.json, the alias table,
and weeks/<week_ending>/<unit>/<file>. `read(path, kind)` does the actual
reading, a fetch in the browser or a file read in the tests, and returns
text when kind is "text" and bytes when kind is "bytes".

Returns { aliasText, weeks: [{ weekEnding, files }] }, ready for buildHistory.
*/
const BINARY = /\.(xlsx|xls)$/i;

export async function loadDataFolder(read) {
  const manifest = JSON.parse(await read("manifest.json", "text"));
  const aliasText = await read(manifest.alias_table, "text");
  const weeks = await Promise.all(Object.entries(manifest.weeks).map(async ([weekEnding, units]) => {
    const files = {};
    await Promise.all(Object.entries(units).map(async ([unit, names]) => {
      files[unit] = {};
      await Promise.all(names.map(async (name) => {
        const kind = BINARY.test(name) ? "bytes" : "text";
        files[unit][name] = await read(`weeks/${weekEnding}/${unit}/${name}`, kind);
      }));
    }));
    return { weekEnding, files };
  }));
  return { aliasText, weeks };
}
