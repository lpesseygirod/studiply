/**
 * delete-account — Settings → Account → Delete account… (App Review 5.1.1(v)).
 *
 * POST { confirm: "DELETE", appleCode?, appleClient?: "ios" | "web" } with her own token
 * (verify_jwt = true). Deletes the caller's account and everything in it:
 *
 *   1. who: the user of her own token (auth.getUser); never an id from the body;
 *   2. her files, in every bucket that holds them (audio-chunks, slides, photos: every object under
 *      {her id}/), listed by account_storage_objects and removed through the Storage API in batches;
 *      if any removal fails, nothing else is done (502 delete_failed) and she can try again;
 *   3. with Sign in with Apple and a fresh code: her Apple token revoked (Apple's rule); without the
 *      key configured, or without a code, skipped and logged; a failed revocation never blocks;
 *   4. her auth user deleted: every public table follows (user_id … on delete cascade).
 *
 * Idempotent: called again once her account is gone (her token still valid until it expires), it
 * removes any file left under her id and answers { deleted: true } again. The service role is used
 * only inside this function. Logs ids and counts only, never names, paths or codes.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { removalBatches } from '../_shared/purge.ts';
import {
  appleConfig,
  appleSecretParts,
  base64url,
  clientIdFor,
  pemToDer,
  revokeForm,
  subjectOf,
  tokenForm,
  validateDeleteBody,
  type AppleClient,
  type AppleConfig,
} from '../_shared/account-deletion.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function log(event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: 'delete-account', event, ...details }));
}

/** Her files, removed; the count, or null when a removal failed. */
// deno-lint-ignore no-explicit-any
async function removeFiles(admin: SupabaseClient<any, 'public', any>, userId: string): Promise<number | null> {
  const { data, error } = await admin.rpc('account_storage_objects', { uid: userId });
  if (error) {
    log('list_failed', { userId, code: error.code });
    return null;
  }
  const objects = (data ?? []) as { bucket_id: string; name: string }[];
  let removed = 0;
  for (const { bucket, paths } of removalBatches(objects.map((o) => ({ bucket: o.bucket_id, path: o.name })))) {
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) {
      log('storage_failed', { userId, bucket, removed });
      return null;
    }
    removed += paths.length;
  }
  return removed;
}

/** The client secret: an ES256 JWT signed with the Sign in with Apple key. */
async function appleSecret(config: AppleConfig, clientId: string): Promise<string> {
  const { header, claims } = appleSecretParts(config, clientId, Math.floor(Date.now() / 1000));
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey('pkcs8', new Uint8Array(pemToDer(config.privateKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)));
  return `${input}.${base64url(signature)}`;
}

/** Revokes her Apple token; what happened, for the log (never blocks the deletion). */
async function revokeApple(code: string | null, client: AppleClient): Promise<string> {
  const config = appleConfig((name) => Deno.env.get(name));
  if (!config) return 'skipped_not_configured';
  if (!code) return 'skipped_no_code';
  const clientId = clientIdFor(config, client);
  if (!clientId) return 'skipped_not_configured';
  try {
    const secret = await appleSecret(config, clientId);
    const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const tokenRes = await fetch('https://appleid.apple.com/auth/token', { method: 'POST', headers: form, body: tokenForm(clientId, secret, code) });
    if (!tokenRes.ok) return `token_failed_${tokenRes.status}`;
    const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string };
    const token = tokens.refresh_token ?? tokens.access_token;
    if (!token) return 'token_missing';
    const revokeRes = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: form,
      body: revokeForm(clientId, secret, token, tokens.refresh_token ? 'refresh_token' : 'access_token'),
    });
    return revokeRes.ok ? 'revoked' : `revoke_failed_${revokeRes.status}`;
  } catch (err) {
    return `error_${(err as Error)?.name ?? 'unknown'}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method', 'Use POST.');

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return fail(401, 'unauthorized', 'Please sign in again.');
  const parsed = validateDeleteBody(await req.json().catch(() => null));
  if (!parsed.ok) return fail(400, 'invalid_request', parsed.error);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Who: her own token. Gone already (a second call): the token's subject, checked by the gateway.
  const { data: found } = await admin.auth.getUser(jwt);
  const user = found?.user ?? null;
  const userId = user?.id ?? subjectOf(jwt);
  if (!userId) return fail(401, 'unauthorized', 'Please sign in again.');

  // 2. Her files, before anything else.
  const files = await removeFiles(admin, userId);
  if (files === null) return fail(502, 'delete_failed', 'Your files couldn’t all be deleted. Nothing else was changed; please try again.');

  if (!user) {
    log('already_deleted', { userId, files });
    return json({ deleted: true, files });
  }

  // 3. Sign in with Apple: revoke her token.
  if ((user.identities ?? []).some((i) => i.provider === 'apple')) {
    log('apple', { userId, result: await revokeApple(parsed.value.appleCode, parsed.value.appleClient) });
  }

  // 4. The account: every table follows.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    log('user_failed', { userId, status: error.status });
    return fail(502, 'delete_failed', 'Your account couldn’t be deleted. Your files are gone; please try again to finish.');
  }
  log('account_deleted', { userId, files });
  return json({ deleted: true, files });
});
