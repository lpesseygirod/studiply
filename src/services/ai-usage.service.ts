/**
 * ai-usage.service.ts
 * Read side of the ai_usage table — spend and volume summaries.
 *
 * The Edge Functions write one row per AI call (students can read their
 * rows, never write them). The table is read page by page and summed here;
 * PostgREST has no GROUP BY without a database function, and one student's
 * rows stay small.
 */

import { supabase } from '../lib/supabase';
import { LEGACY_NOTE_FORMAT, serviceError } from '../lib/cloudRows';

const PAGE = 1000;

interface UsageRow {
  lecture_id: string | null;
  operation: string;
  provider: string;
  tokens_input: number;
  tokens_output: number;
  audio_seconds: number | string;
  cost_usd: number | string;
}

async function allUsage(): Promise<UsageRow[]> {
  const rows: UsageRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('lecture_id, operation, provider, tokens_input, tokens_output, audio_seconds, cost_usd')
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw serviceError(error, 'Could not load your AI usage.');
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// -------------------------------------------------------------------
// getUsageSummary
// Returns aggregated totals for display in the account screen.
// -------------------------------------------------------------------
export async function getUsageSummary(_userId: string): Promise<{
  totalSessions: number;
  totalAudioMinutes: number;
  totalNotes: number;
  totalEstimatedCost: number;
}> {
  const [rows, notes] = await Promise.all([
    allUsage(),
    supabase
      .from('summaries')
      .select('id', { count: 'exact', head: true })
      .eq('result->>format', LEGACY_NOTE_FORMAT)
      .eq('result->>isConfirmed', 'true'),
  ]);
  if (notes.error) throw serviceError(notes.error, 'Could not load your AI usage.');

  const transcriptions = rows.filter((r) => r.operation === 'transcription');
  return {
    totalSessions: new Set(transcriptions.map((r) => r.lecture_id).filter(Boolean)).size,
    totalAudioMinutes: Math.floor(transcriptions.reduce((s, r) => s + Number(r.audio_seconds), 0) / 60),
    totalNotes: notes.count ?? 0,
    totalEstimatedCost: rows.reduce((s, r) => s + Number(r.cost_usd), 0),
  };
}

// -------------------------------------------------------------------
// getUsageByOperation
// Per-operation breakdown.
// -------------------------------------------------------------------
export async function getUsageByOperation(_userId: string): Promise<
  { operation: string; count: number; totalCost: number }[]
> {
  const byOperation = new Map<string, { count: number; totalCost: number }>();
  for (const row of await allUsage()) {
    const entry = byOperation.get(row.operation) ?? { count: 0, totalCost: 0 };
    entry.count += 1;
    entry.totalCost += Number(row.cost_usd);
    byOperation.set(row.operation, entry);
  }
  return [...byOperation].map(([operation, entry]) => ({ operation, ...entry }));
}

// -------------------------------------------------------------------
// getSpendingByProvider
// Splits ai_usage rows into transcription (by its operation, so whisper-1's
// rows and ElevenLabs' since 29 Oct 2026 both count) and Anthropic (Claude).
// -------------------------------------------------------------------
export async function getSpendingByProvider(_userId: string): Promise<{
  transcription: { totalCost: number; totalMinutes: number; callCount: number };
  anthropic: { totalCost: number; totalTokensIn: number; totalTokensOut: number; callCount: number };
}> {
  const transcription = { totalCost: 0, totalMinutes: 0, callCount: 0 };
  const anthropic = { totalCost: 0, totalTokensIn: 0, totalTokensOut: 0, callCount: 0 };
  for (const row of await allUsage()) {
    if (row.operation === 'transcription') {
      transcription.totalCost += Number(row.cost_usd);
      transcription.totalMinutes += Number(row.audio_seconds) / 60;
      transcription.callCount += 1;
    } else if (row.provider === 'anthropic') {
      anthropic.totalCost += Number(row.cost_usd);
      anthropic.totalTokensIn += row.tokens_input;
      anthropic.totalTokensOut += row.tokens_output;
      anthropic.callCount += 1;
    }
  }
  return { transcription, anthropic };
}

// -------------------------------------------------------------------
// getSpendingByOperation
// Returns per-operation breakdown with friendly display labels.
// -------------------------------------------------------------------

const OPERATION_LABELS: Record<string, string> = {
  transcription: 'Transcription',
  summary: 'Notes',
  assistant: 'Assistant & Clarifications',
  ocr: 'Photo Analysis',
  image_analysis: 'Photo Analysis',
  quiz: 'Quizzes',
  // Step 10.2-1b: the quiz function's extras, logged apart from writing a quiz.
  quiz_grade: 'Quiz grading',
  quiz_format: 'Past exam format',
};

export async function getSpendingByOperation(userId: string): Promise<
  { operation: string; count: number; totalCost: number; label: string }[]
> {
  // ocr and image_analysis are one line item to the user, so they collapse
  // onto the 'ocr' key here.
  const merged = new Map<string, { count: number; totalCost: number }>();
  for (const row of await getUsageByOperation(userId)) {
    const key = row.operation === 'image_analysis' ? 'ocr' : row.operation;
    const entry = merged.get(key) ?? { count: 0, totalCost: 0 };
    entry.count += row.count;
    entry.totalCost += row.totalCost;
    merged.set(key, entry);
  }
  return [...merged].map(([operation, entry]) => ({
    operation,
    label: OPERATION_LABELS[operation] ?? operation,
    ...entry,
  }));
}
