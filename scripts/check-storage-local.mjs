#!/usr/bin/env node
/**
 * check-storage-local.mjs — end-to-end check of the storage rules.
 *
 * Talks to the real local Storage API (not the database directly):
 *   1. creates two throwaway users, A and B;
 *   2. A uploads a photo into its own folder, the way the app does;
 *   3. B tries to download, sign, list, overwrite, change and delete it,
 *      and a signed-out request tries to read it: all must fail;
 *   4. deletes the test files and both users, even when a check fails.
 *
 * Local only: refuses to run unless Supabase is on 127.0.0.1 / localhost.
 * The service key is read from `supabase status` at run time and never
 * printed or written to a file.
 *
 * Run with Docker and `supabase start` up:  npm run check:storage
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const url = env.API_URL;
if (!url || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  console.error(`Refusing to run: Supabase API is "${url ?? 'not running'}", not local.`);
  process.exit(1);
}

const BUCKET = 'photos';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SERVICE_ROLE_KEY, options);

// A 1×1 white JPEG.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
}

/** Uploads like the app's cloud-storage.service: raw body to the REST endpoint. */
async function upload(token, path, { contentType = 'image/jpeg', upsert = false, body = JPEG } = {}) {
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.ANON_KEY,
      'Content-Type': contentType,
      'x-upsert': String(upsert),
    },
    body,
  });
  const answer = await res.json().catch(() => ({}));
  return { ok: res.ok, status: Number(answer.statusCode) || res.status };
}

async function signIn(email, password) {
  const client = createClient(url, env.ANON_KEY, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`);
  return { client, token: data.session.access_token, id: data.user.id };
}

const run = randomUUID().slice(0, 8);
const password = `Pw-${randomUUID()}`;
const emails = [`a-${run}@storage-check.test`, `b-${run}@storage-check.test`];
const createdUsers = [];
const uploaded = [];

try {
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`Could not create ${email}: ${error.message}`);
    createdUsers.push(data.user.id);
  }
  const a = await signIn(emails[0], password);
  const b = await signIn(emails[1], password);
  const aPath = `${a.id}/profile/avatar-check.jpg`;

  console.log('\nUser A, own folder');
  const up = await upload(a.token, aPath);
  if (up.ok) uploaded.push(aPath);
  check(up.ok, 'A uploads a JPEG into its own folder');
  const own = await a.client.storage.from(BUCKET).download(aPath);
  check(!own.error && own.data?.size === JPEG.length, 'A downloads its own photo');
  const signed = await a.client.storage.from(BUCKET).createSignedUrl(aPath, 60);
  check(!signed.error && (await fetch(signed.data.signedUrl)).ok, 'A opens its own photo with a signed URL');
  const png = await upload(a.token, `${a.id}/profile/not-jpeg.png`, { contentType: 'image/png' });
  if (png.ok) uploaded.push(`${a.id}/profile/not-jpeg.png`);
  check(!png.ok && png.status === 415, `photos refuses a non-JPEG type (got ${png.status})`);
  const big = await upload(a.token, `${a.id}/profile/too-big.jpg`, { body: Buffer.alloc(11 * 1024 * 1024) });
  if (big.ok) uploaded.push(`${a.id}/profile/too-big.jpg`);
  check(!big.ok && big.status === 413, `photos refuses files over 10 MB (got ${big.status})`);
  const planted = await upload(a.token, `${b.id}/planted.jpg`);
  if (planted.ok) uploaded.push(`${b.id}/planted.jpg`);
  check(!planted.ok, "A can't upload into B's folder");

  console.log("\nUser B, A's photo");
  const dl = await b.client.storage.from(BUCKET).download(aPath);
  check(!!dl.error, "B can't download it");
  const bSigned = await b.client.storage.from(BUCKET).createSignedUrl(aPath, 60);
  check(!!bSigned.error, "B can't create a signed URL for it");
  const list = await b.client.storage.from(BUCKET).list(`${a.id}/profile`);
  check(!list.error && list.data.length === 0, "B sees nothing when listing A's folder");
  const over = await upload(b.token, aPath, { upsert: true });
  check(!over.ok, "B can't overwrite it (upsert)");
  const plain = await upload(b.token, aPath);
  check(!plain.ok, "B can't upload over it");
  const upd = await b.client.storage.from(BUCKET).update(aPath, JPEG, { contentType: 'image/jpeg' });
  check(!!upd.error, "B can't replace it with update()");
  const moved = await b.client.storage.from(BUCKET).move(aPath, `${b.id}/stolen.jpg`);
  check(!!moved.error, "B can't move it into its own folder");
  const del = await b.client.storage.from(BUCKET).remove([aPath]);
  check(!del.error && del.data.length === 0, "B's delete removes nothing");

  console.log('\nSigned out');
  const anon = createClient(url, env.ANON_KEY, options);
  const anonDl = await anon.storage.from(BUCKET).download(aPath);
  check(!!anonDl.error, "a signed-out request can't download it");
  const pub = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${aPath}`);
  check(!pub.ok, 'the bucket has no public URL');

  console.log('\nAfterwards');
  const still = await admin.storage.from(BUCKET).download(aPath);
  check(!still.error && still.data?.size === JPEG.length, "A's photo is still there, unchanged");
} catch (err) {
  failures += 1;
  console.error(`✗ ${err.message}`);
} finally {
  console.log('\nCleanup');
  if (uploaded.length) {
    const { error } = await admin.storage.from(BUCKET).remove(uploaded);
    check(!error, `deleted ${uploaded.length} test file(s)`);
  }
  for (const id of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    check(!error, `deleted test user ${id}`);
  }
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  check(!data?.users.some((u) => u.email?.endsWith('@storage-check.test')), 'no @storage-check.test users left');
  for (const id of createdUsers) {
    const { data: left } = await admin.storage.from(BUCKET).list(id, { limit: 100 });
    check(!left?.length, `no files left in ${BUCKET}/${id}/`);
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll storage checks passed.');
process.exit(failures ? 1 : 0);
