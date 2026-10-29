// consent.service asks once per scope and records only what the student allowed.
import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { showAlert } from '../../components/dialogs/dialogs';
import { ConsentDeclinedError, ensureConsent, forgetConsent } from '../consent.service';
import { CONSENT_POLICY_VERSION } from '../../../supabase/functions/_shared/policy';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../components/dialogs/dialogs', () => ({ showAlert: jest.fn() }));

/** Answers the next consent question with the given button. */
function reply(button: 'Allow' | 'Not now') {
  jest.mocked(showAlert).mockImplementationOnce((_title, _message, buttons) => {
    buttons?.find((b) => b.text === button)?.onPress?.();
  });
}

beforeEach(() => {
  resetSupabaseMock();
  forgetConsent();
  jest.mocked(showAlert).mockReset();
});

it('asks, then records consent with the current policy version', async () => {
  answer('ai_consent', { data: [] }, { data: null });
  reply('Allow');

  await ensureConsent('transcription');

  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Send the recording to ElevenLabs?');
  expect(callsOn('ai_consent', 'insert')[0][0]).toEqual({ scope: 'transcription', policy_version: CONSENT_POLICY_VERSION });
});

it('does not ask when consent was given before', async () => {
  answer('ai_consent', { data: [{ id: 'c1' }] });
  await ensureConsent('assistant_summary');
  expect(showAlert).not.toHaveBeenCalled();
  expect(callsOn('ai_consent', 'insert')).toHaveLength(0);
});

it('"Not now" records nothing and stops the flow', async () => {
  answer('ai_consent', { data: [] });
  reply('Not now');
  await expect(ensureConsent('images')).rejects.toBeInstanceOf(ConsentDeclinedError);
  expect(callsOn('ai_consent', 'insert')).toHaveLength(0);
});

it('asks for each missing scope in order and remembers them for the session', async () => {
  answer('ai_consent', { data: [] }, { data: null }, { data: [] }, { data: null });
  reply('Allow');
  reply('Allow');

  await ensureConsent('assistant_summary', 'images');
  expect(jest.mocked(showAlert).mock.calls.map((c) => c[0])).toEqual([
    'Send the transcript to Anthropic?',
    'Send photos and PDFs to Anthropic?',
  ]);

  await ensureConsent('assistant_summary', 'images');
  expect(showAlert).toHaveBeenCalledTimes(2);
});
