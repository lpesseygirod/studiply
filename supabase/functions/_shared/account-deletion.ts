/**
 * account-deletion.ts
 * Step 10.1: the rules of the delete-account Edge Function, kept pure (Jest).
 *
 * - The body is only her confirmation and, for an account with Sign in with Apple, a fresh
 *   authorization code: never a user id (the function takes hers from her own token).
 * - Apple asks apps with Sign in with Apple to revoke the student's token when the account is deleted:
 *   the code is exchanged for a refresh token (appleid.apple.com/auth/token) with a client secret (a
 *   short-lived ES256 JWT signed with the Sign in with Apple key), then revoked (/auth/revoke).
 *   Without the key configured (local, or before Lea adds it) the revocation is skipped and logged.
 */

export const CONFIRM_WORD = 'DELETE';

/** Which Apple client the code was issued to: the iPhone app (bundle id) or the web (Services ID). */
export type AppleClient = 'ios' | 'web';

export interface DeleteBody {
  appleCode: string | null;
  appleClient: AppleClient;
}

export function validateDeleteBody(body: unknown): { ok: true; value: DeleteBody } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: `Send { "confirm": "${CONFIRM_WORD}" } as JSON.` };
  const b = body as Record<string, unknown>;
  if (b.confirm !== CONFIRM_WORD) return { ok: false, error: `confirm must be "${CONFIRM_WORD}".` };
  if (b.appleCode !== undefined && b.appleCode !== null && (typeof b.appleCode !== 'string' || b.appleCode.length > 2000)) return { ok: false, error: 'appleCode must be a string.' };
  if (b.appleClient !== undefined && b.appleClient !== 'ios' && b.appleClient !== 'web') return { ok: false, error: 'appleClient must be ios or web.' };
  return { ok: true, value: { appleCode: (b.appleCode as string | undefined) || null, appleClient: (b.appleClient as AppleClient | undefined) ?? 'ios' } };
}

/** The Apple key's settings (function secrets; names in supabase/functions/.env.example). */
export interface AppleConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
  /** The iPhone app's bundle id (com.studiply.app). */
  bundleId: string;
  /** The web's Services ID. */
  servicesId: string;
}

/** The Apple settings, or null when any is missing (revocation skipped, said in the log). */
export function appleConfig(env: (name: string) => string | undefined): AppleConfig | null {
  const value = (name: string) => (env(name) ?? '').trim();
  const config = {
    teamId: value('APPLE_TEAM_ID'),
    keyId: value('APPLE_KEY_ID'),
    privateKey: value('APPLE_PRIVATE_KEY'),
    bundleId: value('APPLE_BUNDLE_ID') || 'com.studiply.app',
    servicesId: value('APPLE_SERVICES_ID'),
  };
  if (!config.teamId || !config.keyId || !config.privateKey) return null;
  return config;
}

export const clientIdFor = (config: AppleConfig, client: AppleClient): string | null => (client === 'web' ? config.servicesId || null : config.bundleId);

/** The client secret's header and claims (Apple: ES256, at most 6 months; this one lives 5 minutes). */
export function appleSecretParts(config: AppleConfig, clientId: string, nowSeconds: number) {
  return {
    header: { alg: 'ES256', kid: config.keyId, typ: 'JWT' },
    claims: { iss: config.teamId, iat: nowSeconds, exp: nowSeconds + 300, aud: 'https://appleid.apple.com', sub: clientId },
  };
}

export function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let s = '';
  for (const b of raw) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The .p8 key's bytes (PKCS #8), from its PEM text (with or without the header lines; \n escaped or real). */
export function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

/** The form bodies of Apple's two requests. */
export const tokenForm = (clientId: string, secret: string, code: string) =>
  new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code' });
export const revokeForm = (clientId: string, secret: string, token: string, hint: 'refresh_token' | 'access_token') =>
  new URLSearchParams({ client_id: clientId, client_secret: secret, token, token_type_hint: hint });

/**
 * The caller's id from her token's payload. Only after the gateway has checked the token's signature
 * (verify_jwt = true): used when her account is already gone (a second call), so the call can still
 * finish the clean-up.
 */
export function subjectOf(jwt: string): string | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null;
  } catch {
    return null;
  }
}
