#!/usr/bin/env node
/**
 * build-legal.mjs — builds the legal pages.
 * Turns docs/legal/*.md into src/legal/texts.generated.ts (the pages /privacy, /terms, /refunds,
 * /cookies, /legal and LEGAL_VERSION) and the package metadata into src/legal/licences.generated.ts
 * (the open-source licences on /legal). Run after editing a legal text or changing dependencies:
 *
 *   npm run build:legal            writes both files
 *   npm run build:legal -- --check exits 1 when either is out of date (nothing written)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const legal = require('./lib/legal.cjs');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

let stale = 0;
for (const [out, render] of [
  [legal.TEXTS_OUT, legal.renderTexts],
  [legal.LICENCES_OUT, legal.renderLicences],
]) {
  const next = render(root);
  let current = '';
  try {
    current = readFileSync(join(root, out), 'utf8');
  } catch {
    // Not written yet.
  }
  if (current === next) {
    console.log(`up to date  ${out}`);
  } else if (check) {
    console.log(`OUT OF DATE ${out}`);
    stale++;
  } else {
    writeFileSync(join(root, out), next);
    console.log(`written     ${out}`);
  }
}
if (stale) {
  console.log('Run `npm run build:legal`.');
  process.exit(1);
}
