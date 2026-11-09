// check-bundle.mjs's "web must not load SQLite" rule (scripts/lib/sqlite-markers.cjs): it finds
// what a real expo-sqlite import bundles, and a name in text (the licences on /legal) is not a hit.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SQLITE_TEXT_MARKERS, isSqliteFile, sqliteHits } from '../sqlite-markers.cjs';

const root = join(__dirname, '../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) {
      if (name !== '__tests__') sources(path, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

describe('the control: what a web import of expo-sqlite puts in the bundle', () => {
  // The files Metro bundles for `import 'expo-sqlite'` on the web (package.json "browser"/.web.js).
  const imported = ['node_modules/expo-sqlite/build/ExpoSQLite.web.js', 'node_modules/expo-sqlite/web/SQLiteModule.ts', 'node_modules/expo-sqlite/web/WorkerChannel.ts'].map(read).join('\n');

  it('is found: its string literals survive minification', () => {
    expect(sqliteHits(imported)).toBeGreaterThanOrEqual(3);
    for (const literal of ["'ExpoSQLite'", "'onDatabaseChange'", 'Using synchronous SQLite operations']) expect(imported).toContain(literal);
  });

  it('is found in the same code minified onto one line', () => {
    const minified = imported.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    expect(sqliteHits(minified)).toBe(sqliteHits(imported.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')));
    expect(sqliteHits(minified)).toBeGreaterThanOrEqual(3);
  });

  it("is found by Metro's asset registration of wa-sqlite.wasm and in a source map's paths", () => {
    expect(sqliteHits('{"__packager_asset":true,"httpServerLocation":"/assets/node_modules/expo-sqlite/web/wa-sqlite","name":"wa-sqlite","type":"wasm"}')).toBeGreaterThan(0);
    expect(sqliteHits('"sources":["../../node_modules/expo-sqlite/build/index.js"]')).toBe(1);
    expect(sqliteHits('fetch("/wa-sqlite.4f2a9c.wasm")')).toBe(1);
  });

  it('flags the exported wasm and worker files by their path', () => {
    expect(isSqliteFile('assets/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.8d6f1e0b.wasm')).toBe(true);
    expect(isSqliteFile('wa-sqlite.wasm')).toBe(true);
    expect(isSqliteFile('_expo/static/js/web/expo-sqlite-worker-1a2b.js')).toBe(true);
    expect(isSqliteFile('_expo/static/js/web/entry-3f0c2d.js')).toBe(false);
    expect(isSqliteFile('assets/node_modules/libheif-js/libheif-wasm/libheif.5e1f.wasm')).toBe(false);
  });
});

describe('not a hit: the name in text', () => {
  it('the licences on /legal and the legal texts', () => {
    const licences = read('src/legal/licences.generated.ts');
    expect(licences).toContain('"name":"expo-sqlite"');
    expect(sqliteHits(licences)).toBe(0);
    expect(sqliteHits(read('src/legal/texts.generated.ts'))).toBe(0);
  });

  it("the app's own code (the iPhone files import 'expo-sqlite' by name; the web never bundles them)", () => {
    const hits = sources('app')
      .concat(sources('src'))
      .filter((f) => sqliteHits(read(f)) > 0);
    expect(hits).toEqual([]);
  });

  it('every marker is specific: none matches the bare names', () => {
    for (const [, re] of SQLITE_TEXT_MARKERS) {
      for (const bare of ['expo-sqlite', 'wa-sqlite', '"expo-sqlite"', "from 'expo-sqlite'", 'expo-sqlite 16.0.10 · MIT']) expect(bare.match(new RegExp(re.source, 'g'))).toBeNull();
    }
  });
});
