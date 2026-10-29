/**
 * elevenlabs.ts
 * Sends one audio file to ElevenLabs Scribe v2, with the retries in
 * post-audio.ts, and deletes ElevenLabs' stored copy of the transcript
 * afterwards.
 *
 * Asks for word times only: no sound tags, no speakers. A lecture's
 * language, when set, is sent as is (Scribe takes ISO 639-1 and 639-3).
 * Keyterms (the course glossary) can come later; they cost 20 % more.
 */

import { postAudio, type PostResult } from './post-audio.ts';
import { TRANSCRIBE_MODELS, type ScribeAnswer } from './transcript.ts';

const API = 'https://api.elevenlabs.io/v1/speech-to-text';
const DELETE_TIMEOUT_MS = 10_000;

/** ElevenLabs answers errors as { detail: { status, message } } or, for 422, { detail: [{ type, msg }] }. */
function errorCode(answer: unknown): string | undefined {
  const detail = (answer as { detail?: unknown })?.detail;
  if (Array.isArray(detail)) return (detail[0] as { type?: string })?.type;
  return (detail as { status?: string; code?: string })?.status ?? (detail as { code?: string })?.code;
}

export function transcribeScribe(
  apiKey: string,
  audio: Blob,
  fileName: string,
  language: string | null,
  model = TRANSCRIBE_MODELS.elevenlabs.model,
): Promise<PostResult<ScribeAnswer>> {
  return postAudio<ScribeAnswer>(
    API,
    { 'xi-api-key': apiKey },
    () => {
      const form = new FormData();
      form.append('file', audio, fileName);
      form.append('model_id', model);
      form.append('timestamps_granularity', 'word');
      form.append('tag_audio_events', 'false');
      form.append('diarize', 'false');
      if (language) form.append('language_code', language);
      return form;
    },
    errorCode,
  );
}

/**
 * Deletes ElevenLabs' copy of a transcript; Studiply keeps its own. Without
 * Zero Retention Mode (Enterprise only) ElevenLabs stores transcripts, and
 * its debugging logs may still hold them for a while (docs/PROGRESS.md).
 * True when deleted.
 */
export async function deleteScribeTranscript(apiKey: string, transcriptionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/transcripts/${encodeURIComponent(transcriptionId)}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(DELETE_TIMEOUT_MS),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}
