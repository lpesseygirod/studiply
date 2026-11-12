import { formatClaude, formatExtras, formatTranscription, sumToday } from '../credit-check.service';
import { DAILY_LIMIT_SECONDS } from '../../../supabase/functions/_shared/policy';
import { DAILY_CLAUDE_LIMIT_USD, DAILY_EXTRAS_LIMIT_USD } from '../../../supabase/functions/_shared/claude';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

describe('sumToday', () => {
  it('adds audio for transcription, and the cost of what credits pay for and of the extras apart, as the server does (step 10.2-1b)', () => {
    const usage = sumToday([
      { operation: 'transcription', audio_seconds: '600.00', cost_usd: '0.060000' },
      { operation: 'summary', audio_seconds: 0, cost_usd: '0.250000' },
      { operation: 'quiz', audio_seconds: 0, cost_usd: 0.1 },
      { operation: 'assistant', audio_seconds: 0, cost_usd: 0.05 },
      { operation: 'quiz_grade', audio_seconds: 0, cost_usd: 0.02 },
      { operation: 'quiz_format', audio_seconds: 0, cost_usd: 0.03 },
      { operation: 'ocr', audio_seconds: 0, cost_usd: 1 },
    ]);
    expect(usage.transcriptionSeconds).toBe(600);
    expect(usage.claudeUsd).toBeCloseTo(0.35);
    expect(usage.extrasUsd).toBeCloseTo(0.1);
    expect(usage.transcriptionLimitSeconds).toBe(DAILY_LIMIT_SECONDS);
    expect(usage.claudeLimitUsd).toBe(DAILY_CLAUDE_LIMIT_USD);
    expect(usage.extrasLimitUsd).toBe(DAILY_EXTRAS_LIMIT_USD);
    expect(usage.transcriptionReached || usage.claudeReached || usage.extrasReached).toBe(false);
  });

  it('marks a limit reached at the limit', () => {
    const usage = sumToday([
      { operation: 'transcription', audio_seconds: DAILY_LIMIT_SECONDS, cost_usd: 0 },
      { operation: 'summary', audio_seconds: 0, cost_usd: DAILY_CLAUDE_LIMIT_USD },
      { operation: 'assistant', audio_seconds: 0, cost_usd: DAILY_EXTRAS_LIMIT_USD },
    ]);
    expect(usage.transcriptionReached).toBe(true);
    expect(usage.claudeReached).toBe(true);
    expect(usage.extrasReached).toBe(true);
  });
});

describe('labels', () => {
  it('shows minutes, then hours', () => {
    expect(formatTranscription({ transcriptionSeconds: 12 * 60, transcriptionLimitSeconds: 6 * 3600 })).toBe('12 min of 6 h');
    expect(formatTranscription({ transcriptionSeconds: 90 * 60, transcriptionLimitSeconds: 6 * 3600 })).toBe('1.5 h of 6 h');
    expect(formatTranscription({ transcriptionSeconds: 120 * 60, transcriptionLimitSeconds: 6 * 3600 })).toBe('2 h of 6 h');
  });

  it('shows dollars with cents', () => {
    expect(formatClaude({ claudeUsd: 0.4, claudeLimitUsd: 3 })).toBe('$0.40 of $3');
    expect(formatExtras({ extrasUsd: 0.2, extrasLimitUsd: 1 })).toBe('$0.20 of $1');
  });
});
