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
 * second charge) → download → transcribe → log cost in ai_usage → save
 * segments.
 *
 * TRANSCRIBE_PROVIDER picks who transcribes: unset or `elevenlabs` is
 * Scribe v2 (ELEVENLABS_API_KEY), the provider the consent text names since
 * 29 Oct 2026; `openai` is whisper-1 (OPENAI_API_KEY), only with consent
 * text naming OpenAI. Anything else, or a missing key, answers
 * not_configured.
 *
 * Reads and writes the student's rows with a client acting as the student,
 * so RLS applies; only ai_usage, which students can't write, uses the
 * service role (_shared/guard.ts). Never logs audio, transcript text or keys.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { hasConsent, logUsage, ownLecture, signedIn, usedToday } from '../_shared/guard.ts';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { deleteScribeTranscript, transcribeScribe } from '../_shared/elevenlabs.ts';
import { transcribe } from '../_shared/openai.ts';
import { DAILY_LIMIT_SECONDS } from '../_shared/policy.ts';
import {
  MAX_AUDIO_BYTES,
  TRANSCRIBE_MODELS,
  costUsd,
  fromScribe,
  fromWhisper,
  transcribeProvider,
  validateBody,
  type Transcription,
} from '../_shared/transcript.ts';

const BUCKET = 'audio-chunks';

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
  const caller = await signedIn(req);
  if (!caller.ok) return caller.response;
  const { db, userId } = caller;

  const provider = transcribeProvider(Deno.env.get('TRANSCRIBE_PROVIDER'));
  const apiKey = provider ? Deno.env.get(TRANSCRIBE_MODELS[provider].keyEnv) : undefined;
  if (!provider || !apiKey) {
    // The variable's name (never its value), so a missing secret is easy to spot in the serve output.
    log('not_configured', { provider, missing: provider ? TRANSCRIBE_MODELS[provider].keyEnv : 'TRANSCRIBE_PROVIDER' });
    return fail(500, 'not_configured', 'Transcription is not set up on the server yet.');
  }
  const { model, name: providerName } = TRANSCRIBE_MODELS[provider];

  // 2. Valid request, audio in the user's own folder
  const body = await req.json().catch(() => null);
  const valid = validateBody(body, userId);
  if (!valid.ok) return fail(valid.status, valid.code, valid.error);
  const { lectureId, seq, storagePath, startMs } = valid.value;

  try {
    // 3. The user's own lecture (RLS hides everyone else's)
    const lecture = await ownLecture(db, lectureId);
    if (!lecture) return fail(404, 'lecture_not_found', 'That lecture was not found.');

    // 4. Consent to send audio to the provider (Apple 5.1.2(i)), before anything leaves the server
    if (!(await hasConsent(db, 'transcription'))) {
      return fail(403, 'consent_required', `Allow transcription in Settings before Studiply sends audio to ${providerName}.`);
    }

    // 5. Daily limit over the last 24 hours
    if ((await usedToday(db, ['transcription'], 'audio_seconds')) >= DAILY_LIMIT_SECONDS) {
      log('daily_limit', { lectureId, seq });
      return fail(429, 'daily_limit', 'You have reached today’s transcription limit. Try again tomorrow.');
    }

    // 6. Already transcribed: answer from the database, no second provider call
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

    // 8. Transcribe; no language yet means the provider detects it
    const started = Date.now();
    const fileName = storagePath.split('/').pop()!;
    const failed = async (result: { status: number; code: string }) => {
      log('provider_failed', { lectureId, seq, provider, status: result.status, code: result.code });
      if (existing) await db.from('audio_chunks').update({ status: 'failed' }).eq('id', existing.id);
      return fail(502, 'transcription_failed', 'Transcription failed. Please try again.');
    };
    let transcription: Transcription;
    if (provider === 'elevenlabs') {
      const result = await transcribeScribe(apiKey, audio, fileName, lecture.language);
      if (!result.ok) return await failed(result);
      transcription = fromScribe(result.answer, startMs);
      // Studiply keeps the transcript; ElevenLabs' copy goes at once
      const id = result.answer.transcription_id;
      if (id && !(await deleteScribeTranscript(apiKey, id))) log('provider_copy_kept', { lectureId, seq, provider });
    } else {
      const result = await transcribe(apiKey, audio, fileName, lecture.language);
      if (!result.ok) return await failed(result);
      transcription = fromWhisper(result.answer, startMs);
    }
    const { audioSeconds } = transcription;

    // 9. Log the cost first, so it is counted even if saving fails below
    await logUsage({
      user_id: userId,
      lecture_id: lectureId,
      operation: 'transcription',
      provider,
      model,
      audio_seconds: audioSeconds,
      cost_usd: costUsd(audioSeconds, provider),
    });

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
    const rows = transcription.segments.map((s) => ({ ...s, lecture_id: lectureId, chunk_id: chunk.id }));
    if (rows.length) {
      const { error: insertError } = await db.from('transcript_segments').insert(rows);
      if (insertError) throw insertError;
    }
    const { error: statusError } = await db.from('audio_chunks').update({ status: 'transcribed' }).eq('id', chunk.id);
    if (statusError) throw statusError;

    // A lecture without a language takes the detected one; a language the student set is never changed
    const detected = transcription.language;
    if (!lecture.language && detected) {
      await db.from('lectures').update({ language: detected }).eq('id', lectureId).is('language', null);
    }

    log('transcribed', { lectureId, seq, provider, audioSeconds, segments: rows.length, ms: Date.now() - started });
    return json({ chunkId: chunk.id, durationMs: chunk.duration_ms, segments: await storedSegments(db, chunk.id) });
  } catch (err) {
    // Database errors are plain objects with a message, not Error instances
    log('error', { lectureId, seq, message: (err as { message?: string })?.message ?? String(err) });
    return fail(500, 'server_error', 'Something went wrong on the server. Please try again.');
  }
});
