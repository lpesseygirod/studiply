/**
 * @jest-environment node
 */
// The server's pure parts: delete-account's rules (the body never carries a user id; Apple's
// revocation configured or skipped; its client secret's claims; the token's subject for a second call)
// and the consent gate (a run's call never starts once AI was switched off; permanent, not retried).
import { webcrypto } from 'node:crypto';

import {
  appleConfig,
  appleSecretParts,
  base64url,
  clientIdFor,
  CONFIRM_WORD,
  pemToDer,
  revokeForm,
  subjectOf,
  tokenForm,
  validateDeleteBody,
} from '../../../supabase/functions/_shared/account-deletion';
import { ConsentWithdrawnError, gatedCall } from '../../../supabase/functions/_shared/consent-gate';
import { permanentFailure } from '../../../supabase/functions/_shared/summary-pipeline';
import { CONSENT_POLICY_VERSION, CONSENT_SCOPES } from '../../../supabase/functions/_shared/policy';

const env = (values: Record<string, string>) => (name: string) => values[name];
const FULL = { APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nAAEC\\n-----END PRIVATE KEY-----', APPLE_SERVICES_ID: 'com.studiply.web' };

describe('delete-account: the body', () => {
  it('only her confirmation (and an Apple code): no user id is read from it', () => {
    expect(CONFIRM_WORD).toBe('DELETE');
    expect(validateDeleteBody({ confirm: 'DELETE' })).toEqual({ ok: true, value: { appleCode: null, appleClient: 'ios' } });
    expect(validateDeleteBody({ confirm: 'DELETE', appleCode: 'c1', appleClient: 'web', userId: 'someone-else' })).toEqual({ ok: true, value: { appleCode: 'c1', appleClient: 'web' } });
    expect(validateDeleteBody({ confirm: 'delete' })).toMatchObject({ ok: false });
    expect(validateDeleteBody({})).toMatchObject({ ok: false });
    expect(validateDeleteBody(null)).toMatchObject({ ok: false });
    expect(validateDeleteBody({ confirm: 'DELETE', appleClient: 'android' })).toMatchObject({ ok: false });
    expect(validateDeleteBody({ confirm: 'DELETE', appleCode: 5 })).toMatchObject({ ok: false });
  });
});

describe('delete-account: Apple’s revocation', () => {
  it('configured only with the team, the key id and the key (else skipped); the client id per platform', () => {
    expect(appleConfig(env({}))).toBeNull();
    expect(appleConfig(env({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K' }))).toBeNull();
    const config = appleConfig(env(FULL))!;
    expect(config).toMatchObject({ teamId: 'TEAM123456', keyId: 'KEY1234567', bundleId: 'com.studiply.app', servicesId: 'com.studiply.web' });
    expect(clientIdFor(config, 'ios')).toBe('com.studiply.app');
    expect(clientIdFor(config, 'web')).toBe('com.studiply.web');
    expect(clientIdFor({ ...config, servicesId: '' }, 'web')).toBeNull();
  });

  it('the client secret: ES256 with the key id; issued by the team, for Apple, about the client, 5 minutes', () => {
    const { header, claims } = appleSecretParts(appleConfig(env(FULL))!, 'com.studiply.app', 1_000_000);
    expect(header).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
    expect(claims).toEqual({ iss: 'TEAM123456', iat: 1_000_000, exp: 1_000_300, aud: 'https://appleid.apple.com', sub: 'com.studiply.app' });
  });

  it('the key read from its PEM (escaped or real line breaks); base64url without padding; the two forms', () => {
    expect([...pemToDer(FULL.APPLE_PRIVATE_KEY)]).toEqual([0, 1, 2]);
    expect([...pemToDer('-----BEGIN PRIVATE KEY-----\nAAEC\n-----END PRIVATE KEY-----')]).toEqual([0, 1, 2]);
    expect(base64url(new Uint8Array([251, 255]))).toBe('-_8');
    expect(Object.fromEntries(tokenForm('id', 's', 'c'))).toEqual({ client_id: 'id', client_secret: 's', code: 'c', grant_type: 'authorization_code' });
    expect(Object.fromEntries(revokeForm('id', 's', 't', 'refresh_token'))).toEqual({ client_id: 'id', client_secret: 's', token: 't', token_type_hint: 'refresh_token' });
  });

  it('a client secret made this way verifies with the key (ES256, P-256)', async () => {
    const { subtle } = webcrypto;
    const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const der = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`;
    const key = await subtle.importKey('pkcs8', new Uint8Array(pemToDer(pem)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const input = `${base64url('{"alg":"ES256"}')}.${base64url('{"sub":"x"}')}`;
    const signature = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)));
    expect(signature).toHaveLength(64); // r‖s, as JWT's ES256 wants
    expect(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, signature, new TextEncoder().encode(input))).toBe(true);
  });
});

describe('delete-account: a second call', () => {
  it('her id from the (gateway-checked) token’s subject; anything else: none', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const jwt = `${base64url('{"alg":"HS256"}')}.${base64url(JSON.stringify({ sub: id, role: 'authenticated' }))}.sig`;
    expect(subjectOf(jwt)).toBe(id);
    expect(subjectOf(`${base64url('{}')}.${base64url('{"sub":"not-an-id"}')}.s`)).toBeNull();
    expect(subjectOf('garbage')).toBeNull();
  });
});

describe('the consent gate (a summary’s calls)', () => {
  it('allowed: the call starts once and answers', async () => {
    const start = jest.fn(() => ({ finalMessage: async () => 'answer', currentMessage: undefined }));
    const call = gatedCall(async () => true, start, () => {});
    expect(await call.finalMessage()).toBe('answer');
    expect(await call.finalMessage()).toBe('answer');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('switched off: never started (nothing sent), noted, a permanent 403 (not tried again)', async () => {
    const start = jest.fn();
    const blocked = jest.fn();
    const call = gatedCall(async () => false, start, blocked);
    await expect(call.finalMessage()).rejects.toBeInstanceOf(ConsentWithdrawnError);
    expect(start).not.toHaveBeenCalled();
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(call.currentMessage).toBeUndefined();
    expect(permanentFailure({ status: new ConsentWithdrawnError().status })).toBe(true);
  });
});

describe('the policy', () => {
  it('one answer gives the three scopes, under the store version', () => {
    expect(CONSENT_SCOPES).toEqual(['transcription', 'assistant_summary', 'images']);
    expect(CONSENT_POLICY_VERSION).toBe('2026-11-store-1');
  });
});
