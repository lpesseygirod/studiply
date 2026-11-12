#!/usr/bin/env node
/**
 * check-bundle.mjs — proves that no secret ships in the app.
 *
 * Builds the web bundle and the iOS bundle (`expo export`) into a temporary
 * folder, then searches every output file for:
 *   1. the actual secret values on this Mac: EXPO_PUBLIC_OPENAI_API_KEY and
 *      EXPO_PUBLIC_ANTHROPIC_API_KEY in .env (if still there),
 *      OPENAI_API_KEY, ANTHROPIC_API_KEY, ELEVENLABS_API_KEY and CRON_SECRET in supabase/functions/.env, and
 *      the local service_role key, secret key and JWT secret from
 *      `supabase status`, and the remote project's service_role and
 *      sb_secret_ keys from `supabase projects api-keys`;
 *   2. anything shaped like an OpenAI or Anthropic key (sk-…) or a
 *      Supabase secret key (sb_secret_…);
 *   3. the names of the AI key variables, `service_role`, and the OpenAI
 *      and Anthropic API hosts (only the Edge Functions may call them);
 *   4. web only: expo-sqlite / wa-sqlite (the web build must never load SQLite): what bundling it
 *      leaves (module and asset paths, wa-sqlite's wasm, its web module's strings) and its files
 *      in the export, not the package's name (the licences on /legal name it).
 *
 * Prints how many hits each check has per bundle and exits 1 on any hit.
 * Secret values are never printed: a hit shows the file and the first four
 * characters only. The public Supabase URL and anon key are expected in the
 * bundle and are not checked.
 *
 *   npm run check:bundle            (a few minutes: two full exports)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const require = createRequire(import.meta.url);
const { sqliteHits, isSqliteFile } = require('./lib/sqlite-markers.cjs');

const ROOT = process.cwd();

/** KEY=value pairs of a dotenv file (no expansion), or {} when missing. */
function readEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );
}

function supabaseStatus() {
  try {
    const out = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return Object.fromEntries(
      out
        .split('\n')
        .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    );
  } catch {
    return null;
  }
}

/** The remote project's secret keys (service_role, sb_secret_…), or null when the CLI can't fetch them. */
function remoteSecretKeys() {
  const ref = readEnv(join(ROOT, '.env.remote')).EXPO_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]{20})\./)?.[1];
  if (!ref) return null;
  try {
    const out = execFileSync('supabase', ['projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const keys = JSON.parse(out);
    return {
      serviceRole: keys.find((k) => k.name === 'service_role')?.api_key,
      secret: keys.filter((k) => k.type === 'secret').map((k) => k.api_key),
    };
  } catch {
    return null;
  }
}

// ── The secrets to look for (values stay in memory, never printed) ──
const appEnv = readEnv(join(ROOT, '.env'));
const functionsEnv = readEnv(join(ROOT, 'supabase/functions/.env'));
const status = supabaseStatus();
const remote = remoteSecretKeys();
const isRealValue = (v) => typeof v === 'string' && v.length >= 16 && !/^your_|_here$/.test(v);

const secretSources = [
  ['.env EXPO_PUBLIC_OPENAI_API_KEY', appEnv.EXPO_PUBLIC_OPENAI_API_KEY],
  ['.env EXPO_PUBLIC_ANTHROPIC_API_KEY', appEnv.EXPO_PUBLIC_ANTHROPIC_API_KEY],
  ['functions OPENAI_API_KEY', functionsEnv.OPENAI_API_KEY],
  ['functions ANTHROPIC_API_KEY', functionsEnv.ANTHROPIC_API_KEY],
  ['functions ELEVENLABS_API_KEY', functionsEnv.ELEVENLABS_API_KEY],
  ['functions CRON_SECRET', functionsEnv.CRON_SECRET],
  ['local SERVICE_ROLE_KEY', status?.SERVICE_ROLE_KEY],
  ['local SECRET_KEY', status?.SECRET_KEY],
  ['local JWT_SECRET', status?.JWT_SECRET],
  ['remote service_role key', remote?.serviceRole],
  ...(remote?.secret.length ? remote.secret : [undefined]).map((value, i) => [`remote secret key ${i + 1}`, value]),
];
const secrets = secretSources.filter(([, value]) => isRealValue(value));
const missing = secretSources
  .filter(([, value]) => !isRealValue(value))
  .map(([name, value]) => `${name} (${value === undefined ? 'not set' : 'empty or a placeholder'})`);

/**
 * Control: the public anon key is inlined into the bundle on purpose. If the
 * search can't find it, it couldn't find a secret either.
 */
const anonKey = appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** [label, test(text) → number of hits, which bundles] */
const checks = [
  ...secrets.map(([name, value]) => [`value of ${name}`, (text) => count(text, value), ['web', 'ios']]),
  // sk-proj- and sk-ant- are distinctive anywhere (Hermes stores strings back
  // to back, so a key needn't start a word). A bare legacy `sk-` key must
  // start a word and has no dashes: icon names like "flask-empty-outline" are not keys.
  [
    'an OpenAI-style key  sk-proj-… / sk-…',
    (text) =>
      (text.match(/sk-proj-[A-Za-z0-9_-]{20,}/g) ?? []).length +
      (text.match(/(?<![A-Za-z0-9])sk-(?!ant-|proj-)[A-Za-z0-9]{32,}/g) ?? []).length,
    ['web', 'ios'],
  ],
  ['an Anthropic-style key  sk-ant-…', (text) => (text.match(/sk-ant-[A-Za-z0-9_-]{20,}/g) ?? []).length, ['web', 'ios']],
  // supabase-js itself contains the bare prefix (it checks key formats), and Hermes may store it
  // right before "_isInsecureUserWarning…", so only a full key counts. The real keys are checked by value above.
  ['a Supabase secret key  sb_secret_…', (text) => (text.match(/sb_secret_(?!_)[A-Za-z0-9_-]{20,}/g) ?? []).length, ['web', 'ios']],
  ['the name OPENAI_API_KEY', (text) => count(text, 'OPENAI_API_KEY'), ['web', 'ios']],
  ['the name ANTHROPIC_API_KEY', (text) => count(text, 'ANTHROPIC_API_KEY'), ['web', 'ios']],
  ['the name ELEVENLABS_API_KEY', (text) => count(text, 'ELEVENLABS_API_KEY'), ['web', 'ios']],
  ['the word service_role', (text) => count(text, 'service_role'), ['web', 'ios']],
  ['the host api.openai.com', (text) => count(text, 'api.openai.com'), ['web', 'ios']],
  ['the host api.anthropic.com', (text) => count(text, 'api.anthropic.com'), ['web', 'ios']],
  ['the host api.elevenlabs.io', (text) => count(text, 'api.elevenlabs.io'), ['web', 'ios']],
  // What bundling expo-sqlite leaves (paths, wa-sqlite's files, its web module's strings), never the
  // bare package name: the licences on /legal name it. scripts/lib/sqlite-markers.cjs.
  ['expo-sqlite / wa-sqlite code (web must not load SQLite)', (text) => sqliteHits(text), ['web']],
  ['expo-sqlite / wa-sqlite files in the export', (_text, path) => (isSqliteFile(path) ? 1 : 0), ['web'], 'paths'],
];

function count(text, needle) {
  let n = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) n += 1;
  return n;
}

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** The bundle's text files and Hermes bytecode (its strings are plain bytes); images and fonts are skipped. */
const SEARCHED = /\.(js|mjs|hbc|html|json|map|css|txt)$/;

const work = mkdtempSync(join(tmpdir(), 'studiply-bundle-'));
let failed = false;
try {
  const results = {};
  for (const platform of ['web', 'ios']) {
    const out = join(work, platform);
    console.log(`Building the ${platform} bundle…`);
    execFileSync('npx', ['expo', 'export', '--platform', platform, '--output-dir', out, '--clear'], {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, CI: '1' },
    });
    const allFiles = filesUnder(out);
    const files = allFiles.filter((f) => SEARCHED.test(f));
    const bytes = files.reduce((sum, f) => sum + statSync(f).size, 0);
    console.log(`  ${files.length} files searched (${(bytes / 1024 / 1024).toFixed(1)} MB)`);

    results[platform] = checks.map(([label, test, platforms, scope]) => {
      if (!platforms.includes(platform)) return { label, hits: null, where: [] };
      let hits = 0;
      const where = [];
      // 'paths': every exported file by its path (a .wasm too), its text unread.
      for (const file of scope === 'paths' ? allFiles : files) {
        const n = scope === 'paths' ? test('', relative(out, file)) : test(readFileSync(file, 'latin1'), relative(out, file));
        if (n) {
          hits += n;
          where.push(`${relative(out, file)} (${n})`);
        }
      }
      return { label, hits, where };
    });

    if (isRealValue(anonKey)) {
      const found = files.reduce((sum, f) => sum + count(readFileSync(f, 'latin1'), anonKey), 0);
      console.log(`  control: the public anon key is found ${found} time(s)${found ? ' — the search works' : ''}`);
      if (!found) {
        console.log('  ✗ the search could not find a value that is in the bundle; its results would mean nothing');
        failed = true;
      }
    }
  }

  console.log('\nHits per check (0 = not found):\n');
  const width = Math.max(...checks.map(([label]) => label.length));
  console.log(`  ${'check'.padEnd(width)}   web   ios`);
  checks.forEach(([label], i) => {
    const cell = (r) => (r.hits === null ? '   —' : String(r.hits).padStart(4));
    const web = results.web[i];
    const ios = results.ios[i];
    const bad = (web.hits ?? 0) + (ios.hits ?? 0) > 0;
    if (bad) failed = true;
    console.log(`${bad ? '✗' : '✓'} ${label.padEnd(width)}  ${cell(web)}  ${cell(ios)}`);
    for (const r of [web, ios]) for (const w of r.where) console.log(`      found in ${w}`);
  });

  if (missing.length) console.log(`\nNo value to search for: ${missing.join(', ')}.`);
  console.log(failed ? '\n✗ Something that must not ship is in a bundle.' : '\n✓ No key, secret or SQLite where it must not be.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
