/**
 * credit-check.service.ts
 * How much AI the student has used today, against the server's daily limits.
 *
 * Since step 1.7 nobody brings their own OpenAI or Anthropic account: the
 * Edge Functions call them with Studiply's keys and enforce a daily limit
 * per student, counted over a rolling 24 hours from ai_usage (which the
 * student can read but not write). The limits are imported from the
 * functions' own rules, so the app and the server never disagree. Plans and
 * real limits come in step 10.2.
 */

import { supabase } from '../lib/supabase';
import { serviceError } from '../lib/cloudRows';
import { isMockAiForced } from '../lib/aiMode';
import { DAILY_CLAUDE_LIMIT_USD, DAILY_EXTRAS_LIMIT_USD, EXTRAS_OPERATIONS, PAID_OPERATIONS } from '../../supabase/functions/_shared/claude';
import { DAILY_LIMIT_SECONDS, LIMIT_WINDOW_MS } from '../../supabase/functions/_shared/policy';

const PAGE = 1000;

export interface TodayUsage {
  /** Audio transcribed in the last 24 hours, and the limit, in seconds. */
  transcriptionSeconds: number;
  transcriptionLimitSeconds: number;
  /** Claude paid in credits (summaries, writing quizzes) in the last 24 hours, and the limit, in USD. */
  claudeUsd: number;
  claudeLimitUsd: number;
  /** Step 10.2-1b: the extras (the assistant, grading, a past exam's format), and their own daily limit. */
  extrasUsd: number;
  extrasLimitUsd: number;
  transcriptionReached: boolean;
  claudeReached: boolean;
  extrasReached: boolean;
  /** Development with EXPO_PUBLIC_MOCK_AI=1: nothing is sent or counted. */
  simulated: boolean;
}

/** Usage over the last 24 hours, summed the way the Edge Functions sum it. */
export function sumToday(rows: { operation: string; audio_seconds: number | string | null; cost_usd: number | string | null }[]) {
  let transcriptionSeconds = 0;
  let claudeUsd = 0;
  let extrasUsd = 0;
  for (const row of rows) {
    if (row.operation === 'transcription') transcriptionSeconds += Number(row.audio_seconds ?? 0);
    if ((PAID_OPERATIONS as readonly string[]).includes(row.operation)) claudeUsd += Number(row.cost_usd ?? 0);
    if ((EXTRAS_OPERATIONS as readonly string[]).includes(row.operation)) extrasUsd += Number(row.cost_usd ?? 0);
  }
  return {
    transcriptionSeconds,
    transcriptionLimitSeconds: DAILY_LIMIT_SECONDS,
    claudeUsd,
    claudeLimitUsd: DAILY_CLAUDE_LIMIT_USD,
    extrasUsd,
    extrasLimitUsd: DAILY_EXTRAS_LIMIT_USD,
    transcriptionReached: transcriptionSeconds >= DAILY_LIMIT_SECONDS,
    claudeReached: claudeUsd >= DAILY_CLAUDE_LIMIT_USD,
    extrasReached: extrasUsd >= DAILY_EXTRAS_LIMIT_USD,
  };
}

// -------------------------------------------------------------------
// getTodayUsage
// -------------------------------------------------------------------
export async function getTodayUsage(): Promise<TodayUsage> {
  const since = new Date(Date.now() - LIMIT_WINDOW_MS).toISOString();
  const rows: { operation: string; audio_seconds: number | null; cost_usd: number | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('operation, audio_seconds, cost_usd')
      .gte('created_at', since)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw serviceError(error, 'Could not load your AI usage.');
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return { ...sumToday(rows), simulated: isMockAiForced() };
}

/** "12 min of 6 h", for banners. */
export function formatTranscription(usage: Pick<TodayUsage, 'transcriptionSeconds' | 'transcriptionLimitSeconds'>): string {
  const used = Math.round(usage.transcriptionSeconds / 60);
  const usedLabel = used >= 60 ? `${(used / 60).toFixed(1).replace(/\.0$/, '')} h` : `${used} min`;
  return `${usedLabel} of ${usage.transcriptionLimitSeconds / 3600} h`;
}

/** "$0.40 of $3", for banners. */
export function formatClaude(usage: Pick<TodayUsage, 'claudeUsd' | 'claudeLimitUsd'>): string {
  return `$${usage.claudeUsd.toFixed(2)} of $${usage.claudeLimitUsd}`;
}

/** "$0.20 of $1": the extras' daily guard (Development only). */
export function formatExtras(usage: Pick<TodayUsage, 'extrasUsd' | 'extrasLimitUsd'>): string {
  return `$${usage.extrasUsd.toFixed(2)} of $${usage.extrasLimitUsd}`;
}
