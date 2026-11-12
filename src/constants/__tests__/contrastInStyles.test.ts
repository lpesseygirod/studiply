// Every style in the app that sets a text colour on its own background (one style object
// with both `color: c.…` and `backgroundColor: c.…`) passes WCAG contrast in both palettes:
// 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold). Found by reading the source, so a new
// screen's pair is checked without adding it by hand; contrast.test.ts keeps the pairs that span two
// styles (text on a card, on the gradient, chips…).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { contrast } from '../../theme/contrast';
import { DarkColors, LightColors, type ThemeColors } from '../colors';
import { Typography } from '../typography';

const root = join(__dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') sources(path, out);
    } else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function token(palette: ThemeColors, path: string): string | null {
  let v: unknown = palette;
  for (const key of path.split('.')) v = (v as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}

interface Pair {
  where: string;
  fg: string;
  bg: string;
  min: number;
}

/** One style object: `{ … }` with no nested braces. */
const STYLE = /\{[^{}]*\}/g;
const COLOR = /(?:^|[\s,{])color:\s*(?:c|colors)\.([\w.]+)/;
const BACKGROUND = /backgroundColor:\s*(?:c|colors)\.([\w.]+)/;

function pairsIn(file: string): Pair[] {
  const text = readFileSync(file, 'utf8');
  const out: Pair[] = [];
  for (const m of text.matchAll(STYLE)) {
    const block = m[0];
    const fg = COLOR.exec(block)?.[1];
    const bg = BACKGROUND.exec(block)?.[1];
    if (!fg || !bg) continue;
    const sizeKey = /fontSize:\s*Typography\.size\[?'?([\w]+)'?\]?/.exec(block)?.[1];
    const size = sizeKey ? (Typography.size as Record<string, number>)[sizeKey] : Number(/fontSize:\s*(\d+)/.exec(block)?.[1] ?? 0);
    const bold = /fontWeight:\s*(Typography\.weight\.(bold|extrabold|black|semibold)|'[6-9]00')/.test(block);
    const large = size >= 24 || (size >= 18.66 && bold);
    const line = text.slice(0, m.index).split('\n').length;
    out.push({ where: `${relative(root, file)}:${line}`, fg, bg, min: large ? 3 : 4.5 });
  }
  return out;
}

const pairs = [...sources(join(root, 'app')), ...sources(join(root, 'src'))].flatMap(pairsIn);

it('finds the app’s own text-on-background styles (the scan is not empty)', () => {
  expect(pairs.length).toBeGreaterThan(15);
});

describe.each([
  ['light', LightColors],
  ['dark', DarkColors],
])('%s palette', (_name, palette) => {
  it('every text colour on its own background passes', () => {
    const failing = pairs
      .map((p) => ({ ...p, f: token(palette, p.fg), b: token(palette, p.bg) }))
      .filter((p) => p.f && p.b && contrast(p.f, p.b) < p.min)
      .map((p) => `${p.where}  ${p.fg} on ${p.bg}: ${contrast(p.f!, p.b!).toFixed(2)} < ${p.min}`);
    expect(failing).toEqual([]);
  });
});
