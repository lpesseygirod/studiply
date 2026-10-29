/**
 * transcript.ts
 * Rules for the transcribe-chunk Edge Function, kept free of Deno and
 * network code so Jest can test them (src/lib/__tests__/transcript.test.ts).
 *
 * Times: both providers answer in seconds from the start of the chunk;
 * the database stores milliseconds from the start of the recording, so
 * every segment is shifted by the chunk's start time.
 */

/**
 * Who transcribes, chosen on the server with TRANSCRIBE_PROVIDER.
 *
 * whisper-1 stays the default until ElevenLabs is ready to switch on
 * (docs/PROGRESS.md, Things Lea must do). OpenAI shuts whisper-1 down on
 * 26 Feb 2027 and its successor, gpt-transcribe, returns no timestamps.
 * Scribe v2 returns the time of every word; wordsToSegments below groups
 * them into sentences.
 */
export type TranscribeProvider = 'openai' | 'elevenlabs';

export const TRANSCRIBE_MODELS: Record<
  TranscribeProvider,
  { model: string; name: string; keyEnv: string; pricePerMinuteUsd: number }
> = {
  openai: { model: 'whisper-1', name: 'OpenAI', keyEnv: 'OPENAI_API_KEY', pricePerMinuteUsd: 0.006 },
  // $0.22 per hour of audio, silence included
  elevenlabs: { model: 'scribe_v2', name: 'ElevenLabs', keyEnv: 'ELEVENLABS_API_KEY', pricePerMinuteUsd: 0.22 / 60 },
};

/** TRANSCRIBE_PROVIDER as set on the server; unset means whisper-1, anything unknown is refused. */
export function transcribeProvider(value: string | undefined): TranscribeProvider | null {
  const name = (value ?? '').trim().toLowerCase();
  if (name === '') return 'openai';
  return name === 'openai' || name === 'elevenlabs' ? name : null;
}

/** Placeholder until plans and server-enforced limits arrive in step 10.2. */
export const DAILY_LIMIT_SECONDS = 6 * 60 * 60;

/** OpenAI's upload limit, same as the audio-chunks bucket (ElevenLabs takes far more). */
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

/** The parts of ElevenLabs Scribe's answer that are used here. */
export interface ScribeAnswer {
  language_code?: string;
  language_probability?: number;
  text?: string;
  audio_duration_secs?: number;
  transcription_id?: string;
  words?: {
    text: string;
    type: 'word' | 'spacing' | 'audio_event';
    start?: number | null;
    end?: number | null;
    logprob?: number;
  }[];
}

/** A sentence ends at . ? ! or …, maybe followed by closing quotes or brackets. */
const SENTENCE_END = /[.?!…]["'”’»)\]]*$/;
/** A pause this long starts a new segment, punctuation or not. */
const PAUSE_S = 1;
/** A sentence running longer than this is cut after the next word, so its time chip stays useful. */
const MAX_SEGMENT_S = 30;

/** How long the chunk is: ElevenLabs' own figure, else the end of the last timed word. */
function scribeSeconds(answer: ScribeAnswer): number {
  if (typeof answer.audio_duration_secs === 'number') return answer.audio_duration_secs;
  return Math.max(0, ...(answer.words ?? []).map((w) => w.end ?? w.start ?? 0));
}

/**
 * Scribe's words grouped into sentences, as rows for transcript_segments.
 *
 * A segment ends after a word with . ? ! or …, before a pause of a second
 * or more, or once it runs past 30 s. Sounds Scribe tags (laughter) are
 * left out. Confidence is the average word probability, exp(mean logprob),
 * like Whisper's. Times are kept inside the chunk, as in toSegments.
 */
export function wordsToSegments(answer: ScribeAnswer, startMs: number): Segment[] {
  const durationMs = Math.round(scribeSeconds(answer) * 1000);
  const words = answer.words ?? [];

  if (words.length === 0) {
    const text = (answer.text ?? '').trim();
    return text ? [{ start_ms: startMs, end_ms: startMs + durationMs, text, confidence: null }] : [];
  }

  const rows: Segment[] = [];
  let text = '';
  let first: number | null = null;
  let last: number | null = null;
  let logprobs: number[] = [];

  const close = () => {
    const sentence = text.replace(/\s+/g, ' ').trim();
    if (sentence) {
      // A sentence with no timed word sits where the one before it ended
      const previousEnd = rows.length ? (rows[rows.length - 1].end_ms - startMs) / 1000 : 0;
      let start = Math.max(0, Math.round((first ?? previousEnd) * 1000));
      let end = Math.max(start, Math.round((last ?? first ?? previousEnd) * 1000));
      if (durationMs > 0) {
        start = Math.min(start, durationMs);
        end = Math.min(end, durationMs);
      }
      const confidence = logprobs.length
        ? Math.min(1, Math.max(0, Math.exp(logprobs.reduce((a, b) => a + b, 0) / logprobs.length)))
        : null;
      rows.push({ start_ms: startMs + start, end_ms: startMs + end, text: sentence, confidence });
    }
    text = '';
    first = null;
    last = null;
    logprobs = [];
  };

  for (const word of words) {
    if (word.type === 'audio_event') continue;
    if (word.type === 'spacing') {
      if (text) text += word.text;
      continue;
    }
    const start = typeof word.start === 'number' ? word.start : null;
    const end = typeof word.end === 'number' ? word.end : start;
    if (start !== null && last !== null && start - last >= PAUSE_S) close();

    text += word.text;
    if (first === null && start !== null) first = start;
    if (end !== null) last = end;
    if (typeof word.logprob === 'number') logprobs.push(word.logprob);

    if (SENTENCE_END.test(word.text.trim()) || (first !== null && last !== null && last - first >= MAX_SEGMENT_S)) {
      close();
    }
  }
  close();
  return rows;
}

/** One chunk's transcript, whichever provider made it. */
export interface Transcription {
  audioSeconds: number;
  /** The detected language as an ISO code, or null. */
  language: string | null;
  segments: Segment[];
}

const toHundredths = (seconds: number) => Math.round(seconds * 100) / 100;

export function fromWhisper(verbose: WhisperVerbose, startMs: number): Transcription {
  return {
    audioSeconds: toHundredths(verbose.duration ?? 0),
    language: languageCode(verbose.language),
    segments: toSegments(verbose, startMs),
  };
}

/** Scribe's language counts only when it is fairly sure (a lecture keeps the first language it gets). */
export function fromScribe(answer: ScribeAnswer, startMs: number): Transcription {
  const sure = (answer.language_probability ?? 1) >= 0.5;
  return {
    audioSeconds: toHundredths(scribeSeconds(answer)),
    language: sure ? languageCode(answer.language_code) : null,
    segments: wordsToSegments(answer, startMs),
  };
}

/** What a transcription costs, rounded like the ai_usage.cost_usd column. */
export function costUsd(audioSeconds: number, provider: TranscribeProvider = 'openai'): number {
  return Math.round((audioSeconds / 60) * TRANSCRIBE_MODELS[provider].pricePerMinuteUsd * 1e6) / 1e6;
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

/** ElevenLabs may answer in ISO 639-3 ("spa"); the same languages by their three-letter codes. */
const ISO_639_3: Record<string, string> = {
  afr: 'af', sqi: 'sq', amh: 'am', ara: 'ar', hye: 'hy', asm: 'as', aze: 'az', bak: 'ba', eus: 'eu',
  bel: 'be', ben: 'bn', bos: 'bs', bre: 'br', mya: 'my', spa: 'es', cat: 'ca', zho: 'zh', cmn: 'zh',
  hrv: 'hr', ces: 'cs', dan: 'da', nld: 'nl', eng: 'en', est: 'et', fao: 'fo', fin: 'fi', fra: 'fr',
  glg: 'gl', kat: 'ka', deu: 'de', ell: 'el', guj: 'gu', hat: 'ht', hau: 'ha', heb: 'he', hin: 'hi',
  hun: 'hu', isl: 'is', ind: 'id', ita: 'it', jpn: 'ja', jav: 'jv', kan: 'kn', kaz: 'kk', khm: 'km',
  kor: 'ko', lao: 'lo', lat: 'la', lav: 'lv', ltz: 'lb', lin: 'ln', lit: 'lt', mkd: 'mk', mlg: 'mg',
  msa: 'ms', zsm: 'ms', mal: 'ml', mlt: 'mt', mri: 'mi', mar: 'mr', ron: 'ro', mon: 'mn', nep: 'ne',
  nor: 'no', nob: 'no', nno: 'nn', oci: 'oc', pan: 'pa', pus: 'ps', fas: 'fa', pes: 'fa', pol: 'pl',
  por: 'pt', rus: 'ru', san: 'sa', srp: 'sr', sna: 'sn', snd: 'sd', sin: 'si', slk: 'sk', slv: 'sl',
  som: 'so', sun: 'su', swa: 'sw', swe: 'sv', tgl: 'tl', fil: 'tl', tgk: 'tg', tam: 'ta', tat: 'tt',
  tel: 'te', tha: 'th', bod: 'bo', tur: 'tr', tuk: 'tk', ukr: 'uk', urd: 'ur', uzb: 'uz', vie: 'vi',
  cym: 'cy', yid: 'yi', yor: 'yo',
};

/**
 * The ISO code for the detected language, or null if it isn't one we know.
 * Whisper names it ("english"); ElevenLabs gives a two- or three-letter code.
 */
export function languageCode(detected: string | null | undefined): string | null {
  if (!detected) return null;
  const value = detected.trim().toLowerCase();
  if (LANGUAGE_CODES.has(value)) return value;
  return WHISPER_LANGUAGES[value] ?? ISO_639_3[value] ?? null;
}
