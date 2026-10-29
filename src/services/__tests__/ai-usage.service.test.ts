// ai-usage.service: transcription minutes count by what was done, so
// ElevenLabs' rows (since 29 Oct 2026) and whisper-1's older ones both count.
import { answer, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { getSpendingByProvider } from '../ai-usage.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);

beforeEach(() => resetSupabaseMock());

const row = (operation: string, provider: string, audioSeconds: number, cost: number, tokens = 0) => ({
  lecture_id: 'l1',
  operation,
  provider,
  tokens_input: tokens,
  tokens_output: tokens,
  audio_seconds: String(audioSeconds),
  cost_usd: String(cost),
});

it('counts ElevenLabs and whisper-1 minutes as transcription, and Claude apart', async () => {
  answer('ai_usage', {
    data: [
      row('transcription', 'openai', 120, 0.012),
      row('transcription', 'elevenlabs', 300, 0.018333),
      row('summary', 'anthropic', 0, 0.05, 1000),
    ],
  });
  const stats = await getSpendingByProvider('u1');
  expect(stats.transcription.totalMinutes).toBeCloseTo(7);
  expect(stats.transcription.callCount).toBe(2);
  expect(stats.transcription.totalCost).toBeCloseTo(0.030333);
  expect(stats.anthropic).toEqual({ totalCost: 0.05, totalTokensIn: 1000, totalTokensOut: 1000, callCount: 1 });
});
