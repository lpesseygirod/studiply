/**
 * transcribe-chunk — turns one uploaded audio chunk into transcript segments.
 *
 * POST { lectureId, seq, storagePath, startMs } with the user's access token.
 *   storagePath: the chunk in the audio-chunks bucket ({userId}/…), step 1.4
 *   seq:         the chunk's number in the lecture (audio_chunks is unique on it)
 *   startMs:     where the chunk starts in the recording
 *
 * In order: signed in → valid request → own lecture → transcription consent
 * → under the daily limit → (already done? answer from the database, no
 * second charge) → download → Whisper → log cost in ai_usage → save segments.
 *
 * Reads and writes the student's rows with a client acting as the student,
 * so RLS applies; only ai_usage, which students can't write, uses the
 * service role. Never logs audio, transcript text or keys.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { transcribe } from '../_shared/openai.ts';
import {
  CONSENT_POLICY_VERSION,
  DAILY_LIMIT_SECONDS,
  MAX_AUDIO_BYTES,
  TRANSCRIBE_MODEL,
  costUsd,
  languageCode,
  toSegments,
  validateBody,
} from '../_shared/transcript.ts';

const BUCKET = 'audio-chunks';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

function log(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'transcribe-chunk', event, ...details }));
}

/** The chunk's segments as the app receives them. */
async function storedSegments(db: SupabaseClient, chunkId: string) {
  const { data, error } = await db
    .from('transcript_segments')
    .select('start_ms, end_ms, text')
    .eq('chunk_id', chunkId)
    .order('start_ms');
  if (error) throw error;
  return data.map((s) => ({ startMs: s.start_ms, endMs: s.end_ms, text: s.text }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

  // 1. Signed in
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    ...clientOptions,
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return fail(401, 'not_signed_in', 'Please sign in again.');
  const userId = auth.user.id;

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    log('not_configured', {});
    return fail(500, 'not_configured', 'Transcription is not set up on the server yet.');
  }

  // 2. Valid request, audio in the user's own folder
  const body = await req.json().catch(() => null);
  const valid = validateBody(body, userId);
  if (!valid.ok) return fail(valid.status, valid.code, valid.error);
  const { lectureId, seq, storagePath, startMs } = valid.value;

  try {
    // 3. The user's own lecture (RLS hides everyone else's)
    const { data: lecture, error: lectureError } = await db
      .from('lectures')
      .select('id, language')
      .eq('id', lectureId)
      .maybeSingle();
    if (lectureError) throw lectureError;
    if (!lecture) return fail(404, 'lecture_not_found', 'That lecture was not found.');

    // 4. Consent to send audio to OpenAI (Apple 5.1.2(i)), before anything leaves the server
    const { data: consent, error: consentError } = await db
      .from('ai_consent')
      .select('id')
      .eq('scope', 'transcription')
      .eq('policy_version', CONSENT_POLICY_VERSION)
      .is('withdrawn_at', null)
      .limit(1);
    if (consentError) throw consentError;
    if (!consent.length) {
      return fail(403, 'consent_required', 'Allow transcription in Settings before Studiply sends audio to OpenAI.');
    }

    // 5. Daily limit over the last 24 hours. Fine below the API's 1000-row cap:
    // 6 hours of 30-second chunks is 720 rows, and no rows are added once it's reached.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: usage, error: usageError } = await db
      .from('ai_usage')
      .select('audio_seconds')
      .eq('operation', 'transcription')
      .gte('created_at', since);
    if (usageError) throw usageError;
    const usedSeconds = usage.reduce((sum, row) => sum + Number(row.audio_seconds), 0);
    if (usedSeconds >= DAILY_LIMIT_SECONDS) {
      log('daily_limit', { lectureId, seq });
      return fail(429, 'daily_limit', 'You have reached today’s transcription limit. Try again tomorrow.');
    }

    // 6. Already transcribed: answer from the database, no second OpenAI call
    const { data: existing, error: existingError } = await db
      .from('audio_chunks')
      .select('id, status, storage_path, duration_ms')
      .eq('lecture_id', lectureId)
      .eq('seq', seq)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'transcribed' && existing.storage_path === storagePath) {
      log('cached', { lectureId, seq });
      return json({ chunkId: existing.id, durationMs: existing.duration_ms, segments: await storedSegments(db, existing.id) });
    }

    // 7. Download as the user (Storage policies apply)
    const { data: audio, error: downloadError } = await db.storage.from(BUCKET).download(storagePath);
    if (downloadError || !audio) return fail(404, 'audio_not_found', 'The audio for this chunk was not found.');
    if (audio.size > MAX_AUDIO_BYTES) return fail(413, 'audio_too_large', 'This audio chunk is larger than 25 MB.');

    // 8. Whisper; no language yet means Whisper detects it
    const started = Date.now();
    const fileName = storagePath.split('/').pop()!;
    const result = await transcribe(openaiKey, audio, fileName, lecture.language);
    if (!result.ok) {
      log('openai_failed', { lectureId, seq, status: result.status, code: result.code });
      if (existing) await db.from('audio_chunks').update({ status: 'failed' }).eq('id', existing.id);
      return fail(502, 'transcription_failed', 'Transcription failed. Please try again.');
    }
    const audioSeconds = Math.round((result.verbose.duration ?? 0) * 100) / 100;

    // 9. Log the cost first, so it is counted even if saving fails below
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, clientOptions);
    const { error: costError } = await admin.from('ai_usage').insert({
      user_id: userId,
      lecture_id: lectureId,
      operation: 'transcription',
      provider: 'openai',
      model: TRANSCRIBE_MODEL,
      audio_seconds: audioSeconds,
      cost_usd: costUsd(audioSeconds),
    });
    if (costError) throw costError;

    // 10. Save the chunk and replace its segments
    const { data: chunk, error: chunkError } = await db
      .from('audio_chunks')
      .upsert(
        {
          lecture_id: lectureId,
          seq,
          start_ms: startMs,
          duration_ms: Math.max(1, Math.round(audioSeconds * 1000)),
          storage_path: storagePath,
          status: 'uploaded',
        },
        { onConflict: 'lecture_id,seq' },
      )
      .select('id, duration_ms')
      .single();
    if (chunkError) throw chunkError;

    const { error: deleteError } = await db.from('transcript_segments').delete().eq('chunk_id', chunk.id);
    if (deleteError) throw deleteError;
    const rows = toSegments(result.verbose, startMs).map((s) => ({ ...s, lecture_id: lectureId, chunk_id: chunk.id }));
    if (rows.length) {
      const { error: insertError } = await db.from('transcript_segments').insert(rows);
      if (insertError) throw insertError;
    }
    const { error: statusError } = await db.from('audio_chunks').update({ status: 'transcribed' }).eq('id', chunk.id);
    if (statusError) throw statusError;

    // A lecture without a language takes the one Whisper detected; a language the student set is never changed
    const detected = languageCode(result.verbose.language);
    if (!lecture.language && detected) {
      await db.from('lectures').update({ language: detected }).eq('id', lectureId).is('language', null);
    }

    log('transcribed', { lectureId, seq, audioSeconds, segments: rows.length, ms: Date.now() - started });
    return json({ chunkId: chunk.id, durationMs: chunk.duration_ms, segments: await storedSegments(db, chunk.id) });
  } catch (err) {
    // Database errors are plain objects with a message, not Error instances
    log('error', { lectureId, seq, message: (err as { message?: string })?.message ?? String(err) });
    return fail(500, 'server_error', 'Something went wrong on the server. Please try again.');
  }
});
