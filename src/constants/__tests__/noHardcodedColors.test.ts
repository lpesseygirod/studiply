// Colors come only from src/constants/colors.ts (CLAUDE.md), so
// both appearances stay complete and every pair is contrast-checked.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../../..');

// Not styling: the palettes themselves, the printed PDF (always light), and
// the earlier app's SQLite schema and sample data (stored course colors).
const ALLOWED = new Set([
  'src/constants/colors.ts',
  'src/utils/pdf-template.ts',
  'src/lib/db.ts',
  'src/services/legacyImport/sample.ts',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'types' || name === 'test-utils' ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const COLOR = /['"`]#[0-9A-Fa-f]{3,8}['"`]|\brgba?\(/;

describe('no hard-coded colors', () => {
  it('app/ and src/ use the palette tokens', () => {
    const found: string[] = [];
    for (const file of [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'src'))]) {
      const rel = relative(ROOT, file);
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (COLOR.test(line)) found.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(found).toEqual([]);
  });
});
