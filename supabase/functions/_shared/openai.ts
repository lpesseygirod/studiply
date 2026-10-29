/**
 * openai.ts
 * Sends one audio file to OpenAI's transcription endpoint (whisper-1),
 * with the retries in post-audio.ts.
 */

import { postAudio, type PostResult } from './post-audio.ts';
import { TRANSCRIBE_MODELS, type WhisperVerbose } from './transcript.ts';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

export function transcribe(
  apiKey: string,
  audio: Blob,
  fileName: string,
  language: string | null,
  model = TRANSCRIBE_MODELS.openai.model,
): Promise<PostResult<WhisperVerbose>> {
  return postAudio<WhisperVerbose>(
    ENDPOINT,
    { Authorization: `Bearer ${apiKey}` },
    () => {
      const form = new FormData();
      form.append('file', audio, fileName);
      form.append('model', model);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');
      if (language) form.append('language', language);
      return form;
    },
    (answer) => {
      const error = (answer as { error?: { code?: string; type?: string } })?.error;
      return error?.code ?? error?.type;
    },
  );
}
