#!/usr/bin/env node
/**
 * start-remote.mjs — start Expo against the remote Supabase project.
 *
 * `.env` stays the local default. This script reads `.env.remote` (git-ignored,
 * see .env.remote.example), checks that it holds only public values, and
 * starts `expo start --clear` with them.
 *
 * In development the app does NOT see a script's variables when a .env file
 * sets the same name: Expo's client module `expo/virtual/env` merges `.env`,
 * `.env.development`, `.env.local` and `.env.development.local` over
 * `process.env` (so the iPhone once got 127.0.0.1 from `.env` although this
 * script had set the remote URL). The remote project therefore also goes in
 * as EXPO_PUBLIC_REMOTE_SUPABASE_URL / _ANON_KEY, names no .env file may use,
 * and src/lib/supabase.ts prefers them (`pickSupabaseEnv`). `--clear` drops
 * bundles built for the other backend.
 *
 *   npm run start:remote             iPhone (Expo Go)
 *   npm run start:remote -- --web    laptop
 *   npm run start:local              back to local Supabase
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FILE = '.env.remote';

let text;
try {
  text = readFileSync(FILE, 'utf8');
} catch {
  console.error(`Missing ${FILE}. Copy .env.remote.example to ${FILE} and fill in the remote URL and anon key.`);
  process.exit(1);
}

const vars = Object.fromEntries(
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"(.*)"$/, '$1')]),
);

function refuse(reason) {
  console.error(`Refusing to start: ${reason} (${FILE}).`);
  process.exit(1);
}

// Only public values may reach the bundle.
for (const [name, value] of Object.entries(vars)) {
  if (!name.startsWith('EXPO_PUBLIC_')) refuse(`${name} is not an EXPO_PUBLIC_ variable`);
  if (/service_role|sb_secret_|sk-[A-Za-z0-9_-]{8,}/.test(value)) refuse(`${name} looks like a secret key`);
}

const url = vars.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = vars.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const ref = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)?.[1];
if (!ref) refuse(`EXPO_PUBLIC_SUPABASE_URL "${url}" is not https://<project-ref>.supabase.co`);

if (!key.startsWith('sb_publishable_')) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    refuse('EXPO_PUBLIC_SUPABASE_ANON_KEY is neither an anon JWT nor an sb_publishable_ key');
  }
  if (payload.role !== 'anon') refuse(`EXPO_PUBLIC_SUPABASE_ANON_KEY has role "${payload.role}", not "anon"`);
  if (payload.ref !== ref) refuse('EXPO_PUBLIC_SUPABASE_ANON_KEY belongs to another project');
}

// The .env files the app merges over this script's variables in development.
const DEV_ENV_FILES = ['.env', '.env.development', '.env.local', '.env.development.local'];
for (const file of DEV_ENV_FILES) {
  let names;
  try {
    names = readFileSync(file, 'utf8').split('\n').map((l) => l.trim().match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean);
  } catch {
    continue;
  }
  for (const [, name, value] of names) {
    if (name.startsWith('EXPO_PUBLIC_REMOTE_')) refuse(`${file} sets ${name}; only this script may (remove it from ${file})`);
    if (name === 'EXPO_PUBLIC_MOCK_AI' && value && !vars.EXPO_PUBLIC_MOCK_AI) {
      refuse(`${file} sets EXPO_PUBLIC_MOCK_AI, which would also apply against the remote project (comment it out in ${file})`);
    }
  }
}

console.log(`Backend: REMOTE (${ref}.supabase.co)`);

const env = {
  ...process.env,
  // Unset unless .env.remote turns it on, so a local EXPO_PUBLIC_MOCK_AI=1 doesn't carry over.
  EXPO_PUBLIC_MOCK_AI: '',
  ...vars,
  // What the app actually reads first (see the top of this file).
  EXPO_PUBLIC_REMOTE_SUPABASE_URL: url,
  EXPO_PUBLIC_REMOTE_SUPABASE_ANON_KEY: key,
};
const child = spawn('npx', ['expo', 'start', '--clear', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
