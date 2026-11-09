/**
 * @jest-environment node
 */
// Step 10.1: AI switched off on this device (lib/consentGate): lib/functions sends nothing to an AI
// function (the server's own refusal, answered here), but delete-account still goes; per account; it
// survives a restart (AsyncStorage). The permission texts in app.json: clear, the same microphone text
// everywhere, Sign in with Apple's entitlement.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { callFunction, FunctionError } from '../functions';
import { isAiPaused, setAiPaused, setAiPauseUser } from '../consentGate';

jest.mock('../supabase', () => ({
  supabaseUrl: 'http://127.0.0.1:54321',
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'token' } } }),
      refreshSession: async () => ({ error: null }),
    },
  },
}));

const fetchMock = jest.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));

beforeEach(async () => {
  fetchMock.mockClear();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  setAiPauseUser('user-1');
  await setAiPaused(false);
});

describe('AI off on this device', () => {
  it('no AI function is called (the refusal is the server’s: 403 consent_required); delete-account still is', async () => {
    await setAiPaused(true);
    for (const name of ['transcribe-chunk', 'summarize', 'assistant-chat', 'quiz'] as const) {
      const err = await callFunction(name, {}).catch((e) => e);
      expect(err).toBeInstanceOf(FunctionError);
      expect(err).toMatchObject({ status: 403, code: 'consent_required' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await callFunction('delete-account', { confirm: 'DELETE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('on again: calls go out', async () => {
    await setAiPaused(true);
    await setAiPaused(false);
    await callFunction('quiz', {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('per account, and kept across a restart (read back from storage)', async () => {
    await setAiPaused(true);
    setAiPauseUser('user-2');
    expect(await isAiPaused()).toBe(false);
    setAiPauseUser('user-1');
    expect(await isAiPaused()).toBe(true);
    setAiPauseUser(null);
    expect(await isAiPaused()).toBe(false);
  });
});

describe('app.json', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../../../app.json'), 'utf8')).expo;
  const plugin = (name: string) => app.plugins.find((p: unknown) => (Array.isArray(p) ? p[0] : p) === name);

  it('the microphone text says when it records, the same in Info.plist and both audio plugins', () => {
    const mic = app.ios.infoPlist.NSMicrophoneUsageDescription;
    expect(mic).toMatch(/only while you record a lecture/);
    expect(plugin('expo-av')[1].microphonePermission).toBe(mic);
    expect(plugin('expo-audio')[1].microphonePermission).toBe(mic);
  });

  it('camera and photo library say what for; no "needs access" boilerplate', () => {
    const picker = plugin('expo-image-picker')[1];
    expect(picker.cameraPermission).toMatch(/whiteboard or slides/);
    expect(picker.photosPermission).toMatch(/slides, notes or the whiteboard/);
    for (const t of [picker.cameraPermission, picker.photosPermission, app.ios.infoPlist.NSMicrophoneUsageDescription]) expect(t).not.toMatch(/needs .* access/);
  });

  it('Sign in with Apple: the entitlement and its plugin', () => {
    expect(app.ios.usesAppleSignIn).toBe(true);
    expect(plugin('expo-apple-authentication')).toBeTruthy();
  });
});
