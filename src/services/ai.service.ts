/**
 * ai.service.ts
 * Transcription, study notes and clarifications, through the Supabase Edge
 * Functions (step 1.7). The OpenAI and Anthropic keys live on the server;
 * the app never calls those services itself and holds no key.
 *
 *   transcribeAudio → transcribe-chunk, once per uploaded audio chunk
 *   generateNotes   → summarize (task 'notes'), which reads the transcript
 *                     and, if asked, the photos and PDFs itself
 *   clarifyContent  → assistant-chat (mode 'clarify')
 *
 * Each asks for consent first (consent.service). The functions log the
 * cost in ai_usage themselves.
 *
 * Simulated pipeline (development only, never in a store build): with
 * EXPO_PUBLIC_MOCK_AI=1, or when the functions can't be reached at all
 * (`supabase functions serve` not running), fake text is used instead and
 * nothing is sent anywhere. See lib/aiMode.ts.
 */

import { callFunction, callStreamingFunction } from '../lib/functions';
import { canFallBackToMock, isMockAiForced, noteAiFellBack, noteAiReal } from '../lib/aiMode';
import { ensureConsent } from './consent.service';
import { getAudioChunks } from './source-file.service';
import { createTranscript, getTranscriptBySession } from './transcript.service';
import type { Session, Transcript } from '../types/database';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: WhisperSegment[];
}

export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface NoteResult {
  suggestedTitle: string;
  summary: string;
  keyConcepts: KeyConcept[];
  formulas: Formula[];
  definitions: Definition[];
  tags: string[];
  unclearParts: UnclearPart[];
  transcriptPreview: string;
}

export interface KeyConcept {
  term: string;
  explanation: string;
}

export interface Formula {
  name: string;
  expression: string;
  description?: string;
}

export interface Definition {
  term: string;
  definition: string;
}

export interface UnclearPart {
  excerpt: string;
  reason: string;
}

type SummaryLevel = 'minimal' | 'standard' | 'extra';

/** Runs `real`, or the simulation when it's forced or the functions can't be reached (development only). */
async function realOrMock<T>(what: string, real: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  if (isMockAiForced()) return mock();
  try {
    const result = await real();
    noteAiReal();
    return result;
  } catch (err) {
    if (!canFallBackToMock(err)) throw err;
    console.warn(`[ai] The Edge Functions can't be reached; using the simulated ${what} (development only).`);
    noteAiFellBack();
    return mock();
  }
}

function toTranscriptionResult(transcript: Transcript): TranscriptionResult {
  const segments = (Array.isArray(transcript.segments) ? transcript.segments : []) as unknown as WhisperSegment[];
  return {
    text: transcript.full_text,
    language: transcript.language,
    duration: segments.length ? segments[segments.length - 1].end : 0,
    segments,
  };
}

// -------------------------------------------------------------------
// transcribeAudio
// Transcribes each uploaded chunk that isn't yet (the server stores the
// segments and answers a repeat from the database at no cost), then reads
// the lecture's whole transcript. onProgress(done, total) after each chunk.
// -------------------------------------------------------------------
export async function transcribeAudio(params: {
  lectureId: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<TranscriptionResult> {
  const { lectureId, onProgress } = params;

  return realOrMock(
    'transcript',
    async () => {
      const chunks = await getAudioChunks(lectureId);
      const pending = chunks.filter((c) => !c.transcribed);
      if (pending.length > 0) await ensureConsent('transcription');

      let done = chunks.length - pending.length;
      onProgress?.(done, chunks.length);
      for (const chunk of pending) {
        await callFunction('transcribe-chunk', {
          lectureId,
          seq: chunk.seq,
          storagePath: chunk.storagePath,
          startMs: chunk.startMs,
        });
        onProgress?.(++done, chunks.length);
      }

      const transcript = await getTranscriptBySession(lectureId);
      if (!transcript) {
        throw new Error(chunks.length === 0 ? 'No recording was found for this lecture.' : 'No speech was found in this recording.');
      }
      return toTranscriptionResult(transcript);
    },
    () => mockTranscription(lectureId),
  );
}

// -------------------------------------------------------------------
// generateNotes
// The server reads the lecture's transcript, and with includeMedia its
// photos and PDFs (which need their own consent).
// -------------------------------------------------------------------
export async function generateNotes(params: {
  lectureId: string;
  summaryLevel: SummaryLevel;
  title: string;
  recordingMode?: Session['recording_mode'];
  includeMedia?: boolean;
}): Promise<NoteResult> {
  const { lectureId, summaryLevel, title, recordingMode = 'lecture', includeMedia = false } = params;

  return realOrMock(
    'notes',
    async () => {
      await ensureConsent(...(includeMedia ? (['assistant_summary', 'images'] as const) : (['assistant_summary'] as const)));
      const { note } = await callFunction<{ note: NoteResult }>('summarize', {
        lectureId,
        task: 'notes',
        summaryLevel,
        recordingMode,
        title,
        includeMedia,
      });
      return note;
    },
    async () => mockNote(title, summaryLevel, recordingMode),
  );
}

// -------------------------------------------------------------------
// clarifyContent — deeper explanation of highlighted summary parts
// The summary is sent along (on the review screen the note isn't saved
// yet); the server adds the start of the transcript.
// -------------------------------------------------------------------
export async function clarifyContent(params: {
  lectureId: string;
  originalSummary: string;
  highlightedParts: string[];
}): Promise<string> {
  const { lectureId, originalSummary, highlightedParts } = params;

  return realOrMock(
    'clarification',
    async () => {
      await ensureConsent('assistant_summary');
      const { text } = await callStreamingFunction('assistant-chat', {
        lectureId,
        mode: 'clarify',
        highlightedParts,
        summary: originalSummary,
      });
      return text;
    },
    async () => mockClarification(highlightedParts),
  );
}

// -------------------------------------------------------------------
// The simulated pipeline (development only)
// -------------------------------------------------------------------

const SIMULATED_TRANSCRIPT = [
  '[Simulated transcript — development mode, nothing was sent to OpenAI.]',
  'Today we covered the key concepts of this topic, starting with the basic definitions',
  'and then working through two examples step by step. The lecturer stressed that the',
  'second example is typical of exam questions.',
];

async function mockTranscription(lectureId: string): Promise<TranscriptionResult> {
  await delay(1500);
  const existing = await getTranscriptBySession(lectureId);
  if (existing) return toTranscriptionResult(existing);

  const transcript = await createTranscript({
    userId: '',
    sessionId: lectureId,
    language: 'en',
    fullText: SIMULATED_TRANSCRIPT.join(' '),
    segments: SIMULATED_TRANSCRIPT.map((text, i) => ({ start: i * 5, end: (i + 1) * 5, text })),
  });
  return toTranscriptionResult(transcript);
}

async function mockNote(title: string, level: SummaryLevel, mode: string): Promise<NoteResult> {
  await delay(1500);
  const conceptCount = level === 'minimal' ? 1 : level === 'standard' ? 3 : 4;
  return {
    suggestedTitle: title || 'Simulated Session',
    summary: `[Simulated summary for "${title}"] This is placeholder text from the development pipeline. Nothing was sent to Anthropic. Real notes are written by the summarize Edge Function.`,
    keyConcepts: Array.from({ length: conceptCount }, (_, i) => ({
      term: `Concept ${i + 1}`,
      explanation: 'A simulated explanation of this concept.',
    })),
    formulas: [],
    definitions: [{ term: 'Simulated Mode', definition: 'Development mode without real AI calls.' }],
    tags: [`#${(title.split(/\s+/)[0] || 'lecture').toLowerCase()}`, `#${mode}`, '#simulated'],
    unclearParts: [{ excerpt: 'the second example', reason: 'Simulated: audio unclear here.' }],
    transcriptPreview: SIMULATED_TRANSCRIPT.join(' ').slice(0, 300),
  };
}

async function mockClarification(parts: string[]): Promise<string> {
  await delay(1500);
  return [
    '[Simulated clarification]',
    '',
    `You highlighted ${parts.length} part(s) for clarification:`,
    '',
    ...parts.map((part, i) => `${i + 1}. "${part.substring(0, 50)}${part.length > 50 ? '...' : ''}" — explained in more detail by the real assistant.`),
  ].join('\n');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
