/**
 * transcript.ts
 * Rules for the transcribe-chunk Edge Function, kept free of Deno and
 * network code so Jest can test them (src/lib/__tests__/transcript.test.ts).
 *
 * Times: Whisper answers in seconds from the start of the chunk; the
 * database stores milliseconds from the start of the recording, so every
 * segment is shifted by the chunk's start time.
 */

/**
 * whisper-1 is the only OpenAI model with documented segment timestamps
 * (Oct 2026). OpenAI recommends gpt-transcribe instead, but it only
 * returns text; whisper-1 shuts down on 26 Feb 2027, so it must be
 * replaced before then (docs/PROGRESS.md, Things Lea must do).
 */
export const TRANSCRIBE_MODEL = 'whisper-1';
export const PRICE_PER_MINUTE_USD = 0.006;

/** Placeholder until plans and server-enforced limits arrive in step 10.2. */
export const DAILY_LIMIT_SECONDS = 6 * 60 * 60;

/**
 * Consent rows must carry this version. Step 10.1 gives the real consent
 * text a new version, so consent given during development stops counting.
 */
export const CONSENT_POLICY_VERSION = 'dev-2026-10';

/** OpenAI's upload limit, same as the audio-chunks bucket. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface TranscribeRequest {
  lectureId: string;
  seq: number;
  storagePath: string;
  startMs: number;
}

export type Validation =
  | { ok: true; value: TranscribeRequest }
  | { ok: false; status: 400 | 403; code: 'invalid_request' | 'forbidden_path'; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Checks the request body; the audio must sit in the caller's own folder. */
export function validateBody(body: unknown, userId: string): Validation {
  const invalid = (error: string): Validation => ({ ok: false, status: 400, code: 'invalid_request', error });
  if (!body || typeof body !== 'object') return invalid('Send lectureId, seq, storagePath and startMs as JSON.');
  const { lectureId, seq, storagePath, startMs } = body as Record<string, unknown>;

  if (typeof lectureId !== 'string' || !UUID.test(lectureId)) return invalid('lectureId must be a lecture id.');
  if (!isWholeNumber(seq)) return invalid('seq must be a whole number, 0 or more.');
  if (!isWholeNumber(startMs)) return invalid('startMs must be a whole number of milliseconds, 0 or more.');
  if (typeof storagePath !== 'string' || storagePath.length === 0 || storagePath.length > 1024) {
    return invalid('storagePath must be the path of the chunk in the audio-chunks bucket.');
  }
  const parts = storagePath.split('/');
  if (parts.length < 2 || parts.some((part) => part === '' || part === '.' || part === '..')) {
    return invalid('storagePath is not a valid path.');
  }
  if (parts[0] !== userId) {
    return { ok: false, status: 403, code: 'forbidden_path', error: 'That audio file is not in your folder.' };
  }
  return { ok: true, value: { lectureId, seq, storagePath, startMs } };
}

/** The parts of Whisper's verbose_json answer that are used here. */
export interface WhisperVerbose {
  text?: string;
  language?: string;
  duration?: number;
  segments?: {
    start: number;
    end: number;
    text: string;
    avg_logprob?: number;
    no_speech_prob?: number;
  }[];
}

export interface Segment {
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
}

/**
 * Whisper's segments as rows for transcript_segments.
 *
 * Segments Whisper itself rates as probably silence and low confidence are
 * dropped: that is where it invents phrases like "Thanks for watching"
 * (the same thresholds as the open-source Whisper). Confidence is the
 * average token probability, exp(avg_logprob), between 0 and 1.
 */
export function toSegments(verbose: WhisperVerbose, startMs: number): Segment[] {
  const durationMs = Math.round((verbose.duration ?? 0) * 1000);
  const segments = verbose.segments ?? [];

  if (segments.length === 0) {
    const text = (verbose.text ?? '').trim();
    return text ? [{ start_ms: startMs, end_ms: startMs + durationMs, text, confidence: null }] : [];
  }

  const rows: Segment[] = [];
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    if ((segment.no_speech_prob ?? 0) > 0.6 && (segment.avg_logprob ?? 0) < -1) continue;

    let start = Math.max(0, Math.round(segment.start * 1000));
    let end = Math.max(start, Math.round(segment.end * 1000));
    if (durationMs > 0) {
      start = Math.min(start, durationMs);
      end = Math.min(end, durationMs);
    }
    const confidence =
      typeof segment.avg_logprob === 'number' ? Math.min(1, Math.max(0, Math.exp(segment.avg_logprob))) : null;
    rows.push({ start_ms: startMs + start, end_ms: startMs + end, text, confidence });
  }
  return rows;
}

/** What a transcription costs, rounded like the ai_usage.cost_usd column. */
export function costUsd(audioSeconds: number): number {
  return Math.round((audioSeconds / 60) * PRICE_PER_MINUTE_USD * 1e6) / 1e6;
}

/** Whisper names the language it detected ("english"); lectures store ISO 639-1 codes. */
const WHISPER_LANGUAGES: Record<string, string> = {
  afrikaans: 'af', albanian: 'sq', amharic: 'am', arabic: 'ar', armenian: 'hy', assamese: 'as',
  azerbaijani: 'az', bashkir: 'ba', basque: 'eu', belarusian: 'be', bengali: 'bn', bosnian: 'bs',
  breton: 'br', bulgarian: 'bg', burmese: 'my', cantonese: 'yue', castilian: 'es', catalan: 'ca',
  chinese: 'zh', croatian: 'hr', czech: 'cs', danish: 'da', dutch: 'nl', english: 'en',
  estonian: 'et', faroese: 'fo', finnish: 'fi', flemish: 'nl', french: 'fr', galician: 'gl',
  georgian: 'ka', german: 'de', greek: 'el', gujarati: 'gu', haitian: 'ht', 'haitian creole': 'ht',
  hausa: 'ha', hawaiian: 'haw', hebrew: 'he', hindi: 'hi', hungarian: 'hu', icelandic: 'is',
  indonesian: 'id', italian: 'it', japanese: 'ja', javanese: 'jv', kannada: 'kn', kazakh: 'kk',
  khmer: 'km', korean: 'ko', lao: 'lo', latin: 'la', latvian: 'lv', letzeburgesch: 'lb',
  lingala: 'ln', lithuanian: 'lt', luxembourgish: 'lb', macedonian: 'mk', malagasy: 'mg',
  malay: 'ms', malayalam: 'ml', maltese: 'mt', maori: 'mi', marathi: 'mr', moldavian: 'ro',
  moldovan: 'ro', mongolian: 'mn', myanmar: 'my', nepali: 'ne', norwegian: 'no', nynorsk: 'nn',
  occitan: 'oc', panjabi: 'pa', pashto: 'ps', persian: 'fa', polish: 'pl', portuguese: 'pt',
  punjabi: 'pa', pushto: 'ps', romanian: 'ro', russian: 'ru', sanskrit: 'sa', serbian: 'sr',
  shona: 'sn', sindhi: 'sd', sinhala: 'si', sinhalese: 'si', slovak: 'sk', slovenian: 'sl',
  somali: 'so', spanish: 'es', sundanese: 'su', swahili: 'sw', swedish: 'sv', tagalog: 'tl',
  tajik: 'tg', tamil: 'ta', tatar: 'tt', telugu: 'te', thai: 'th', tibetan: 'bo', turkish: 'tr',
  turkmen: 'tk', ukrainian: 'uk', urdu: 'ur', uzbek: 'uz', valencian: 'ca', vietnamese: 'vi',
  welsh: 'cy', yiddish: 'yi', yoruba: 'yo',
};

const LANGUAGE_CODES = new Set(Object.values(WHISPER_LANGUAGES));

/** The ISO code for the language Whisper detected, or null if it isn't one we know. */
export function languageCode(detected: string | undefined): string | null {
  if (!detected) return null;
  const value = detected.trim().toLowerCase();
  if (LANGUAGE_CODES.has(value)) return value;
  return WHISPER_LANGUAGES[value] ?? null;
}
