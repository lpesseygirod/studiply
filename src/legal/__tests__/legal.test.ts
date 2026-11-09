// Step 10.1b-1: the legal pages come from docs/legal, the licences from package metadata, and no
// text a student reads names OpenAI or Whisper.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as legal from '../../../scripts/lib/legal.cjs';
import { LEGAL_TEXTS, LEGAL_VERSION } from '../texts.generated';
import { LICENCE_NOTICES, OPEN_SOURCE_PACKAGES } from '../licences.generated';

const root = join(__dirname, '../../..');

/**
 * The generated file matches what build-legal.mjs makes now. Outside CI a stale file is rewritten
 * (as Jest writes a missing snapshot) and the test still fails, so the change is seen and committed.
 */
function expectUpToDate(out: string, render: (root: string) => string) {
  const file = join(root, out);
  const next = render(root);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (current !== next && !process.env.CI) writeFileSync(file, next);
  expect({ file: out, upToDate: current === next }).toEqual({ file: out, upToDate: true });
}

describe('the generated files', () => {
  it('the pages are up to date with docs/legal (npm run build:legal)', () => {
    expectUpToDate(legal.TEXTS_OUT, legal.renderTexts);
  });

  it('the open-source licences are up to date with the dependencies (npm run build:legal)', () => {
    expectUpToDate(legal.LICENCES_OUT, legal.renderLicences);
  });

  it('every page has its title and its texts version', () => {
    for (const p of legal.LEGAL_PAGES) {
      expect(LEGAL_TEXTS[p.slug].title).toBe(p.title);
      expect(LEGAL_TEXTS[p.slug].blocks[0]?.kind).toBe('title');
    }
    expect(LEGAL_VERSION).toMatch(/^(draft|\d{4}-\d{2}-\d{2})-[0-9a-f]{8}$/);
    expect(LEGAL_VERSION).toBe(legal.legalVersion(root));
  });

  it('each page has its route, readable signed out (app/(legal))', () => {
    for (const p of legal.LEGAL_PAGES) expect(existsSync(join(root, 'app/(legal)', `${p.slug}.tsx`))).toBe(true);
  });
});

describe('open-source licences', () => {
  it('shows libheif-js (LGPL-3.0) in full, with the source of libheif-js and libheif', () => {
    const heif = LICENCE_NOTICES.find((n) => n.name === 'libheif-js');
    expect(heif).toMatchObject({ version: '1.23.5', license: 'LGPL-3.0' });
    expect(heif?.sources).toEqual(['https://github.com/catdad-experiments/libheif-js', 'https://github.com/strukturag/libheif']);
    expect(heif?.text).toContain('GNU LESSER GENERAL PUBLIC LICENSE');
    expect(heif?.about).toMatch(/libheif \(LGPL-3\.0\)/);
  });

  it('lists the direct dependencies, never a dev-only one', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const names = new Set(OPEN_SOURCE_PACKAGES.map((p) => p.name));
    for (const name of Object.keys(pkg.dependencies)) expect(names).toContain(name);
    for (const dev of ['jest', 'jest-expo', 'vite']) expect(names).not.toContain(dev);
    for (const p of OPEN_SOURCE_PACKAGES) expect(p.license).not.toBe('');
  });
});

describe('markdown → blocks', () => {
  const blocks = legal.parseMarkdown(
    [
      '# Studiply Privacy Policy',
      '',
      '**Last updated:** [DATE] · DRAFT',
      '',
      '## 1. Who',
      '',
      '**Account data**',
      '- Your **name**, see our Terms of Service.',
      '- Email [PRIVACY EMAIL] or lea@example.com',
      '',
      '1. Go to **reportaproblem.apple.com**.',
      '',
      '| Provider | Where |',
      '|---|---|',
      '| Supabase | www.aepd.es and https://consumer-redress.ec.europa.eu. |',
      '',
      'A line',
      'and its next line.',
    ].join('\n'),
    'privacy',
  );

  it('reads the title, headings, subheadings, lists, tables and paragraphs', () => {
    expect(blocks.map((b) => b.kind)).toEqual(['title', 'paragraph', 'heading', 'subheading', 'list', 'list', 'table', 'paragraph']);
    expect(blocks[0]).toEqual({ kind: 'title', text: 'Studiply Privacy Policy' });
    expect(blocks[3]).toEqual({ kind: 'subheading', spans: [{ text: 'Account data' }] });
    expect(blocks[7]).toEqual({ kind: 'paragraph', spans: [{ text: 'A line and its next line.' }] });
  });

  it('keeps bold, links the other pages, web addresses and emails', () => {
    const list = blocks[4] as Extract<(typeof blocks)[number], { kind: 'list' }>;
    expect(list.ordered).toBe(false);
    expect(list.items[0]).toEqual([
      { text: 'Your ' },
      { text: 'name', bold: true },
      { text: ', see our ' },
      { text: 'Terms of Service', href: '/terms' },
      { text: '.' },
    ]);
    expect(list.items[1]).toEqual([{ text: 'Email [PRIVACY EMAIL] or ' }, { text: 'lea@example.com', href: 'mailto:lea@example.com' }]);
    const table = blocks[6] as Extract<(typeof blocks)[number], { kind: 'table' }>;
    expect(table.head).toEqual([[{ text: 'Provider' }], [{ text: 'Where' }]]);
    expect(table.rows[0][1]).toEqual([
      { text: 'www.aepd.es', href: 'https://www.aepd.es' },
      { text: ' and ' },
      { text: 'https://consumer-redress.ec.europa.eu', href: 'https://consumer-redress.ec.europa.eu' },
      { text: '.' },
    ]);
  });

  it('never links a page to itself', () => {
    const own = legal.parseMarkdown('Read this Privacy Policy.', 'privacy');
    expect(own).toEqual([{ kind: 'paragraph', spans: [{ text: 'Read this Privacy Policy.' }] }]);
  });
});

describe('the launch checklist (npm run check:launch)', () => {
  it('runs its five rules, lists every bracketed detail, and fails exactly when one fails', () => {
    const run = spawnSync(process.execPath, [join(root, 'scripts/check-launch.mjs')], { cwd: root, encoding: 'utf8' });
    const lines = run.stdout.split('\n');
    const rules = lines.filter((l) => /^(PASS|FAIL) \| /.test(l));
    expect(rules.map((l) => l.replace(/^(PASS|FAIL) \| ([^|]+?)( \| \d+)?$/, '$2'))).toEqual([
      'Bracketed details filled in (docs/legal)',
      'No DRAFT left in the published texts',
      'Generated legal pages and licences up to date',
      'No test fixture in git (tests/fixtures, tests/output)',
      'No user-facing OpenAI or Whisper (transcription is ElevenLabs)',
    ]);
    const brackets = legal.placeholders(root);
    expect(rules[0]).toBe(brackets.length ? `FAIL | Bracketed details filled in (docs/legal) | ${brackets.length}` : 'PASS | Bracketed details filled in (docs/legal)');
    for (const b of brackets) expect(run.stdout).toContain(`${b.file}:${b.line}  ${b.text}`);
    expect(run.status).toBe(rules.some((l) => l.startsWith('FAIL')) ? 1 : 0);
    // The generated files and the OpenAI/Whisper rule are kept by this suite, so they pass here.
    expect(rules[2]).toMatch(/^PASS/);
    expect(rules[4]).toMatch(/^PASS/);
  });

  it("doesn't count Apple's settings path as a detail to fill in", () => {
    expect(legal.placeholders(root).map((p) => p.text)).not.toContain('[your name]');
  });

  it('no text a student reads names OpenAI or Whisper (transcription is ElevenLabs)', () => {
    expect(legal.userFacingMentions(root)).toEqual([]);
  });

  it('finds a user-facing mention when one is there', () => {
    expect(legal.userFacingMentions(root, ['ElevenLabs']).length).toBeGreaterThan(0);
  });
});
