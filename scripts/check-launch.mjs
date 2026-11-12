#!/usr/bin/env node
/**
 * check-launch.mjs — `npm run check:launch`, the launch checklist's text rules.
 * Not part of `npm run check`: it fails while the legal texts are drafts, and must pass before
 * the build that goes to App Review. It fails, listing file:line, while
 *   1. a bracketed detail is still to fill in docs/legal (the five texts and the breach plan);
 *   2. a published text still says DRAFT;
 *   3. the generated pages or licences are behind docs/legal or the dependencies;
 *   4. git tracks a file in tests/fixtures/ or tests/output/ (real lectures: never in git);
 *   5. text a student can read names OpenAI or Whisper (transcription is ElevenLabs).
 * Reads files only; changes nothing.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const legal = require('./lib/legal.cjs');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
function rule(name, findings, describe = (f) => `${f.file}:${f.line}  ${f.text}`) {
  results.push({ name, ok: findings.length === 0, findings, describe });
}

// 1. Bracketed details, grouped by what Lea has to decide.
const brackets = legal.placeholders(root);
rule('Bracketed details filled in (docs/legal)', brackets, (f) => `${f.file}:${f.line}  ${f.text}`);

// 2. DRAFT.
rule('No DRAFT left in the published texts', legal.drafts(root));

// 3. The generated files.
const stale = [];
for (const [out, render] of [
  [legal.TEXTS_OUT, legal.renderTexts],
  [legal.LICENCES_OUT, legal.renderLicences],
]) {
  let current = '';
  try {
    current = readFileSync(join(root, out), 'utf8');
  } catch {
    // Missing counts as out of date.
  }
  if (current !== render(root)) stale.push({ file: out, line: 0, text: 'out of date: run npm run build:legal' });
}
rule('Generated legal pages and licences up to date', stale, (f) => `${f.file}  ${f.text}`);

// 4. Fixtures.
const tracked = execFileSync('git', ['ls-files', '--', 'tests/fixtures', 'tests/output'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .map((file) => ({ file, line: 0, text: 'tracked by git' }));
rule('No test fixture in git (tests/fixtures, tests/output)', tracked, (f) => `${f.file}  ${f.text}`);

// 5. OpenAI / Whisper.
rule('No user-facing OpenAI or Whisper (transcription is ElevenLabs)', legal.userFacingMentions(root), (f) =>
  f.line ? `${f.file}:${f.line}  ${f.text}` : `${f.file}  ${f.text}`,
);

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name}${r.ok ? '' : ` | ${r.findings.length}`}`);
  if (r.ok) continue;
  failed++;
  if (r.findings === brackets) {
    const byCategory = new Map();
    for (const f of brackets) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f]);
    for (const [category, list] of byCategory) {
      console.log(`  ${category}: ${list.length}`);
      for (const f of list) console.log(`    ${r.describe(f)}`);
    }
  } else {
    for (const f of r.findings) console.log(`  ${r.describe(f)}`);
  }
}
console.log(failed ? `\n${failed} of ${results.length} launch rules fail.` : `\nAll ${results.length} launch rules pass.`);
process.exit(failed ? 1 : 0);
