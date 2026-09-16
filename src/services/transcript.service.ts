import { first, run } from '../lib/db';
import { mapTranscript, newId, now, toJson, type TranscriptRow } from '../lib/mappers';
import type { Transcript } from '../types/database';

// -------------------------------------------------------------------
// createTranscript
// -------------------------------------------------------------------
export async function createTranscript(params: {
  userId: string;
  sessionId: string;
  language: string;
  fullText: string;
  segments?: unknown;
  confidenceScore?: number;
}): Promise<Transcript> {
  const id = newId();

  await run(
    `INSERT INTO transcripts (id, user_id, session_id, language, full_text, segments, confidence_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.userId,
      params.sessionId,
      params.language,
      params.fullText,
      toJson(params.segments ?? null),
      params.confidenceScore ?? null,
      now(),
    ],
  );

  const row = await first<TranscriptRow>(`SELECT * FROM transcripts WHERE id = ?`, [id]);
  if (!row) throw new Error('Failed to create transcript.');
  return mapTranscript(row);
}

// -------------------------------------------------------------------
// getTranscriptBySession
// Returns null if no transcript exists yet.
// -------------------------------------------------------------------
export async function getTranscriptBySession(sessionId: string): Promise<Transcript | null> {
  const row = await first<TranscriptRow>(
    `SELECT * FROM transcripts WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`,
    [sessionId],
  );
  return row ? mapTranscript(row) : null;
}
