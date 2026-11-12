/**
 * sqlite-markers.cjs
 * check-bundle.mjs's rule "the web build must never load SQLite", as markers that only
 * bundling expo-sqlite leaves, never its bare name: since the legal pages the open-source licences on
 * /legal name every package (expo-sqlite among them), so a name in text proves nothing either way.
 *
 * A real web import of expo-sqlite bundles build/ExpoSQLite.web.js and web/SQLiteModule.ts,
 * web/WorkerChannel.ts: their string literals survive minification; Metro keeps module and asset
 * paths (the wasm's httpServerLocation, source maps); the export writes wa-sqlite.wasm as a file.
 * Tested against those real files in scripts/lib/__tests__/sqlite-markers.test.ts.
 */

/** [label, RegExp (global)] searched in each bundle file's text. */
const SQLITE_TEXT_MARKERS = [
  ['a module or asset path in node_modules/expo-sqlite or wa-sqlite', /node_modules[\\/]+(?:expo-sqlite|wa-sqlite)[\\/]/g],
  ['the wa-sqlite wasm or module file', /wa-sqlite(?:[.-][\w-]+)?\.(?:wasm|mjs)\b/g],
  ["expo-sqlite's web module name 'ExpoSQLite'", /["'`]ExpoSQLite["'`]/g],
  ["expo-sqlite's change event 'onDatabaseChange'", /["'`]onDatabaseChange["'`]/g],
  ["expo-sqlite's worker channel warning", /Using synchronous SQLite operations/g],
];

/** Hits of every marker in one file's text. */
function sqliteHits(text) {
  return SQLITE_TEXT_MARKERS.reduce((n, [, re]) => n + (text.match(re) ?? []).length, 0);
}

/** An exported file that is expo-sqlite's own (the wasm, the worker), by its path in the output. */
function isSqliteFile(relativePath) {
  return /(?:^|[\\/])(?:expo-sqlite|wa-sqlite)(?:[\\/]|[.-][\w.-]*$|$)/.test(relativePath);
}

module.exports = { SQLITE_TEXT_MARKERS, sqliteHits, isSqliteFile };
