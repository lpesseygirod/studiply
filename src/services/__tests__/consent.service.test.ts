// consent.service asks with the consent screen (desktop-09 / iphone-12): one answer gives the
// three scopes under the current policy version; Not now records nothing. Settings → AI & privacy:
// the status with its date; withdrawing is one call (the server's time), also offline (AI off on this
// device at once, the withdrawal queued on the iPhone); giving again sends a pending withdrawal first.
import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { requestAiConsent } from '../../components/consent/consentRequests';
import { isAiPaused, setAiPaused, setAiPauseUser } from '../../lib/consentGate';
import { consentGiven, consentStatus, ConsentDeclinedError, ensureConsent, forgetConsent, giveConsent, withdrawConsent } from '../consent.service';
import { CONSENT_POLICY_VERSION, CONSENT_SCOPES } from '../../../supabase/functions/_shared/policy';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../components/consent/consentRequests', () => ({ requestAiConsent: jest.fn() }));
jest.mock('../../lib/connectivity', () => ({ isOffline: jest.fn(() => false), onBackOnline: jest.fn(() => () => {}) }));
jest.mock('../../lib/sync', () => ({
  syncEnabled: false,
  enqueue: jest.fn(async () => ({})),
  pendingSyncFor: jest.fn(async () => []),
  discardSync: jest.fn(async () => {}),
  registerSyncHandler: jest.fn(),
}));

const sync = jest.requireMock('../../lib/sync') as { syncEnabled: boolean; enqueue: jest.Mock; pendingSyncFor: jest.Mock; discardSync: jest.Mock; registerSyncHandler: jest.Mock };
const connectivity = jest.requireMock('../../lib/connectivity') as { isOffline: jest.Mock; onBackOnline: jest.Mock };
const handlers = new Map(sync.registerSyncHandler.mock.calls.map(([kind, h]: [string, { run: (p: unknown) => Promise<void> }]) => [kind, h]));
const ask = jest.mocked(requestAiConsent);
const all = (at = '2026-11-12T10:00:00Z') => CONSENT_SCOPES.map((scope) => ({ scope, granted_at: at }));

beforeEach(async () => {
  resetSupabaseMock();
  forgetConsent();
  ask.mockReset();
  jest.clearAllMocks();
  sync.syncEnabled = false;
  sync.pendingSyncFor.mockImplementation(async () => []);
  connectivity.isOffline.mockReturnValue(false);
  setAiPauseUser('user-1');
  await setAiPaused(false);
});

describe('ensureConsent', () => {
  it('asks with the consent screen ("Before you record" for audio), then gives all three scopes with the current version', async () => {
    answer('ai_consent', { data: [] }, { data: [] }, { data: null });
    ask.mockResolvedValueOnce(true);

    await ensureConsent('transcription');

    expect(ask).toHaveBeenCalledWith('record');
    expect(callsOn('ai_consent', 'insert')[0][0]).toEqual(CONSENT_SCOPES.map((scope) => ({ scope, policy_version: CONSENT_POLICY_VERSION })));
    expect(callsOn('ai_consent', 'eq')[0]).toEqual(['policy_version', CONSENT_POLICY_VERSION]);
  });

  it('other AI actions: "Before Studiply uses AI"; once given, not asked again this session (also for the other scopes)', async () => {
    answer('ai_consent', { data: [] }, { data: [] }, { data: null });
    ask.mockResolvedValueOnce(true);
    await ensureConsent('assistant_summary');
    expect(ask).toHaveBeenCalledWith('ai');
    await ensureConsent('images', 'transcription');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('does not ask when the three were given before', async () => {
    answer('ai_consent', { data: all() });
    await ensureConsent('assistant_summary', 'images');
    expect(ask).not.toHaveBeenCalled();
    expect(callsOn('ai_consent', 'insert')).toHaveLength(0);
  });

  it('an earlier answer missing a scope (development consent): asked, only the missing ones written', async () => {
    answer('ai_consent', { data: [{ scope: 'transcription', granted_at: '2026-11-01T00:00:00Z' }] }, { data: [{ scope: 'transcription', granted_at: '2026-11-01T00:00:00Z' }] }, { data: null });
    ask.mockResolvedValueOnce(true);
    await ensureConsent('assistant_summary');
    expect(callsOn('ai_consent', 'insert')[0][0]).toEqual([
      { scope: 'assistant_summary', policy_version: CONSENT_POLICY_VERSION },
      { scope: 'images', policy_version: CONSENT_POLICY_VERSION },
    ]);
  });

  it('"Not now" records nothing and stops the flow', async () => {
    answer('ai_consent', { data: [] });
    ask.mockResolvedValueOnce(false);
    await expect(ensureConsent('images')).rejects.toBeInstanceOf(ConsentDeclinedError);
    expect(callsOn('ai_consent', 'insert')).toHaveLength(0);
  });
});

describe('withdrawing (Settings → AI & privacy)', () => {
  it('one call withdraws every row with the server’s time; AI is off here at once; the next AI action asks again', async () => {
    answer('ai_consent', { data: all() });
    await ensureConsent('assistant_summary');
    await withdrawConsent();
    expect(callsOn('rpc:withdraw_ai_consent', 'args')).toHaveLength(1);
    expect(await isAiPaused()).toBe(true);
    expect(await consentGiven('assistant_summary')).toBe(false);
    // Rows still on the server (a withdrawal not arrived yet) don't count while AI is off here.
    ask.mockResolvedValueOnce(false);
    await expect(ensureConsent('assistant_summary')).rejects.toBeInstanceOf(ConsentDeclinedError);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('offline on the iPhone: off at once, the withdrawal queued; on the laptop: sent when back online', async () => {
    connectivity.isOffline.mockReturnValue(true);
    sync.syncEnabled = true;
    await withdrawConsent();
    expect(await isAiPaused()).toBe(true);
    expect(sync.enqueue).toHaveBeenCalledWith({ kind: 'consent_withdraw', key: 'consent', payload: {} });
    expect(callsOn('rpc:withdraw_ai_consent', 'args')).toHaveLength(0);

    sync.syncEnabled = false;
    sync.enqueue.mockClear();
    await withdrawConsent();
    expect(sync.enqueue).not.toHaveBeenCalled();
    expect(connectivity.onBackOnline).toHaveBeenCalled();
  });

  it('the queued withdrawal, when online: the same call', async () => {
    await handlers.get('consent_withdraw')!.run({});
    expect(callsOn('rpc:withdraw_ai_consent', 'args')).toHaveLength(1);
  });

  it('giving again: a pending withdrawal is sent first and dropped from the queue; AI on again here', async () => {
    sync.pendingSyncFor.mockImplementation(async () => [{ id: 'op-1', kind: 'consent_withdraw' }]);
    await setAiPaused(true);
    answer('ai_consent', { data: [] }, { data: null });
    await giveConsent();
    expect(callsOn('rpc:withdraw_ai_consent', 'args')).toHaveLength(1);
    expect(sync.discardSync).toHaveBeenCalledWith('op-1');
    expect(callsOn('ai_consent', 'insert')[0][0]).toHaveLength(3);
    expect(await isAiPaused()).toBe(false);
  });

  it('giving needs a connection', async () => {
    connectivity.isOffline.mockReturnValue(true);
    await expect(giveConsent()).rejects.toThrow();
    expect(callsOn('ai_consent', 'insert')).toHaveLength(0);
  });
});

describe('consentStatus', () => {
  it('allowed with the first date of the three; a missing scope: off; off here: off', async () => {
    answer('ai_consent', { data: [...all('2026-11-12T10:00:01Z'), { scope: 'images', granted_at: '2026-11-12T10:00:00Z' }] });
    expect(await consentStatus()).toEqual({ allowed: true, since: '2026-11-12T10:00:00Z' });
    answer('ai_consent', { data: [{ scope: 'transcription', granted_at: '2026-11-12T10:00:00Z' }] });
    expect(await consentStatus()).toEqual({ allowed: false, since: null });
    await setAiPaused(true);
    expect(await consentStatus()).toEqual({ allowed: false, since: null });
  });
});

describe('the paused flag belongs to the account', () => {
  it('another account signed in on this device is not paused', async () => {
    await setAiPaused(true);
    setAiPauseUser('user-2');
    expect(await isAiPaused()).toBe(false);
    setAiPauseUser('user-1');
    expect(await isAiPaused()).toBe(true);
  });
});
