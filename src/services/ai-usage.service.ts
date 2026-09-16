/**
 * ai-usage.service.ts
 * Read side of the ai_usage table — spend and volume summaries.
 *
 * These aggregate in SQL rather than pulling every row into JS, since the
 * table grows with every AI call and the account screen reads it on mount.
 */

import { all, first } from '../lib/db';

// -------------------------------------------------------------------
// getUsageSummary
// Returns aggregated totals for display in the account screen.
// -------------------------------------------------------------------
export async function getUsageSummary(userId: string): Promise<{
  totalSessions: number;
  totalAudioMinutes: number;
  totalNotes: number;
  totalEstimatedCost: number;
}> {
  const row = await first<{
    total_sessions: number;
    total_audio_seconds: number;
    total_notes: number;
    total_cost: number;
  }>(
    `SELECT
       (SELECT COUNT(DISTINCT session_id) FROM ai_usage
         WHERE user_id = ? AND operation = 'transcription' AND session_id IS NOT NULL
       ) AS total_sessions,
       (SELECT COALESCE(SUM(audio_seconds), 0) FROM ai_usage
         WHERE user_id = ? AND operation = 'transcription'
       ) AS total_audio_seconds,
       (SELECT COUNT(*) FROM notes
         WHERE user_id = ? AND is_confirmed = 1
       ) AS total_notes,
       (SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM ai_usage
         WHERE user_id = ?
       ) AS total_cost`,
    [userId, userId, userId, userId],
  );

  return {
    totalSessions: row?.total_sessions ?? 0,
    totalAudioMinutes: Math.floor((row?.total_audio_seconds ?? 0) / 60),
    totalNotes: row?.total_notes ?? 0,
    totalEstimatedCost: row?.total_cost ?? 0,
  };
}

// -------------------------------------------------------------------
// getUsageByOperation
// Per-operation breakdown.
// -------------------------------------------------------------------
export async function getUsageByOperation(userId: string): Promise<
  { operation: string; count: number; totalCost: number }[]
> {
  const rows = await all<{ operation: string; count: number; total_cost: number }>(
    `SELECT operation, COUNT(*) AS count, COALESCE(SUM(estimated_cost_usd), 0) AS total_cost
       FROM ai_usage
      WHERE user_id = ?
      GROUP BY operation`,
    [userId],
  );

  return rows.map((r) => ({
    operation: r.operation,
    count: r.count,
    totalCost: r.total_cost,
  }));
}

// -------------------------------------------------------------------
// getSpendingByProvider
// Splits ai_usage rows into OpenAI (whisper) vs Anthropic (claude) buckets.
// -------------------------------------------------------------------
// Rows are bucketed by the model name recorded at call time. 'mock' rows are
// the simulated pipeline and cost nothing, but they count as Anthropic calls
// so the call counter still reflects activity.
export async function getSpendingByProvider(userId: string): Promise<{
  openai: { totalCost: number; totalMinutes: number; callCount: number };
  anthropic: { totalCost: number; totalTokensIn: number; totalTokensOut: number; callCount: number };
}> {
  const row = await first<{
    openai_cost: number;
    openai_seconds: number;
    openai_calls: number;
    anthropic_cost: number;
    anthropic_tokens_in: number;
    anthropic_tokens_out: number;
    anthropic_calls: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN is_openai    THEN estimated_cost_usd END), 0) AS openai_cost,
       COALESCE(SUM(CASE WHEN is_openai    THEN audio_seconds      END), 0) AS openai_seconds,
       COALESCE(SUM(CASE WHEN is_openai    THEN 1 ELSE 0           END), 0) AS openai_calls,
       COALESCE(SUM(CASE WHEN is_anthropic THEN estimated_cost_usd END), 0) AS anthropic_cost,
       COALESCE(SUM(CASE WHEN is_anthropic THEN tokens_input       END), 0) AS anthropic_tokens_in,
       COALESCE(SUM(CASE WHEN is_anthropic THEN tokens_output      END), 0) AS anthropic_tokens_out,
       COALESCE(SUM(CASE WHEN is_anthropic THEN 1 ELSE 0           END), 0) AS anthropic_calls
     FROM (
       SELECT *,
              (model_used LIKE '%whisper%') AS is_openai,
              (model_used LIKE '%claude%' OR model_used LIKE '%mock%') AS is_anthropic
         FROM ai_usage
        WHERE user_id = ?
     )`,
    [userId],
  );

  return {
    openai: {
      totalCost: row?.openai_cost ?? 0,
      totalMinutes: (row?.openai_seconds ?? 0) / 60,
      callCount: row?.openai_calls ?? 0,
    },
    anthropic: {
      totalCost: row?.anthropic_cost ?? 0,
      totalTokensIn: row?.anthropic_tokens_in ?? 0,
      totalTokensOut: row?.anthropic_tokens_out ?? 0,
      callCount: row?.anthropic_calls ?? 0,
    },
  };
}

// -------------------------------------------------------------------
// getSpendingByOperation
// Returns per-operation breakdown with friendly display labels.
// -------------------------------------------------------------------

const OPERATION_LABELS: Record<string, string> = {
  transcription: 'Transcription',
  summarization: 'Notes & Clarifications',
  ocr: 'Photo Analysis',
  photo_analysis: 'Photo Analysis',
};

export async function getSpendingByOperation(userId: string): Promise<
  { operation: string; count: number; totalCost: number; label: string }[]
> {
  // ocr and photo_analysis are one line item to the user, so they collapse
  // onto the 'ocr' key here.
  const rows = await all<{ operation: string; count: number; total_cost: number }>(
    `SELECT CASE WHEN operation = 'photo_analysis' THEN 'ocr' ELSE operation END AS operation,
            COUNT(*) AS count,
            COALESCE(SUM(estimated_cost_usd), 0) AS total_cost
       FROM ai_usage
      WHERE user_id = ?
      GROUP BY 1`,
    [userId],
  );

  return rows.map((r) => ({
    operation: r.operation,
    label: OPERATION_LABELS[r.operation] ?? r.operation,
    count: r.count,
    totalCost: r.total_cost,
  }));
}
