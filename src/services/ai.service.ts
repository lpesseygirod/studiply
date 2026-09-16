/**
 * ai.service.ts
 * Core AI integration — Whisper transcription + Claude note generation.
 *
 * API keys are read from EXPO_PUBLIC_ env vars (personal-use pattern).
 * When keys are absent (or set to placeholder values) the service falls back
 * to a mock pipeline so the app works fully without any API account.
 *
 * Future: migrate to Supabase Edge Functions to keep keys server-side.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { run } from '../lib/db';
import { newId, now } from '../lib/mappers';
import { estimateTokens } from '../utils/tokens';

// Minimal inline type so this service doesn't depend on the DB types module.
interface MediaFile {
  file_path: string;
  file_type: string;
  mime_type?: string | null;
  is_deleted?: boolean;
}

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25 MB Whisper hard limit

// -------------------------------------------------------------------
// LogContext — optional context for fire-and-forget usage logging
// -------------------------------------------------------------------
export interface LogContext {
  userId: string;
  sessionId?: string;
}

// Pricing constants (claude-sonnet-4, as of 2025)
const CLAUDE_PRICE_INPUT_PER_1K = 0.003;   // $3 / 1M tokens
const CLAUDE_PRICE_OUTPUT_PER_1K = 0.015;  // $15 / 1M tokens
const WHISPER_PRICE_PER_MINUTE = 0.006;    // $0.006 / minute

// -------------------------------------------------------------------
// Key guard — returns false when keys are absent or still placeholder
// -------------------------------------------------------------------
function hasAIKeys(): boolean {
  return !!(
    OPENAI_API_KEY &&
    OPENAI_API_KEY !== 'your_openai_api_key_here' &&
    ANTHROPIC_API_KEY &&
    ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here'
  );
}

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

export interface ProcessSessionResult {
  transcription: TranscriptionResult;
  note: NoteResult;
  transcriptTokens: number;
  outputTokens: number;
}

// -------------------------------------------------------------------
// transcribeAudio — real Whisper, accepts multiple chunk URIs
// -------------------------------------------------------------------
export async function transcribeAudio(params: {
  audioUris: string[];
  language?: string;
  onProgress?: (chunkIndex: number, total: number) => void;
  logContext?: LogContext;
}): Promise<TranscriptionResult> {
  const { audioUris, language, onProgress, logContext } = params;
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key is not configured.');

  let combinedText = '';
  let combinedLanguage = language && language !== 'auto' ? language : 'en';
  let totalDuration = 0;
  const combinedSegments: WhisperSegment[] = [];
  let segmentIdOffset = 0;

  for (let i = 0; i < audioUris.length; i++) {
    onProgress?.(i, audioUris.length);

    const formData = new FormData();
    formData.append('file', {
      uri: audioUris[i],
      type: 'audio/m4a',
      name: `chunk_${i}.m4a`,
    } as unknown as Blob);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    if (language && language !== 'auto') {
      formData.append('language', language);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Whisper API error ${response.status} (chunk ${i + 1}): ${errText}`);
    }

    const json = await response.json();
    const chunkDuration: number = json.duration ?? 0;

    if (i === 0) combinedLanguage = json.language ?? combinedLanguage;
    if (combinedText && json.text) combinedText += ' ';
    combinedText += json.text ?? '';

    for (const seg of (json.segments ?? []) as WhisperSegment[]) {
      combinedSegments.push({
        id: segmentIdOffset + seg.id,
        start: totalDuration + seg.start,
        end: totalDuration + seg.end,
        text: seg.text,
      });
    }

    segmentIdOffset += (json.segments ?? []).length;
    totalDuration += chunkDuration;
  }

  onProgress?.(audioUris.length, audioUris.length);

  if (logContext?.userId) {
    logAiUsage({
      userId: logContext.userId,
      sessionId: logContext.sessionId ?? '',
      operation: 'transcription',
      tokensInput: 0,
      tokensOutput: 0,
      audioSeconds: totalDuration,
      estimatedCostUsd: (totalDuration / 60) * WHISPER_PRICE_PER_MINUTE,
      modelUsed: 'whisper-1',
    }).catch(() => {});
  }

  return {
    text: combinedText,
    language: combinedLanguage,
    duration: totalDuration,
    segments: combinedSegments,
  };
}

// -------------------------------------------------------------------
// generateNotes — real Claude
// Accepts pre-loaded imageContents / pdfContents so callers can do
// the file reading (with appropriate logging) before this is invoked.
// -------------------------------------------------------------------
export async function generateNotes(params: {
  transcript: string;
  summaryLevel: 'minimal' | 'standard' | 'extra';
  sessionTitle: string;
  language?: string;
  recordingMode?: string;
  imageContents?: any[];
  pdfContents?: any[];
  logContext?: LogContext;
}): Promise<NoteResult> {
  const {
    transcript,
    summaryLevel,
    sessionTitle,
    language,
    recordingMode,
    imageContents = [],
    pdfContents = [],
    logContext,
  } = params;

  if (!ANTHROPIC_API_KEY) throw new Error('Anthropic API key is not configured.');

  const hasPhotos = imageContents.length > 0;
  const hasPDFs   = pdfContents.length > 0;
  const hasMedia  = hasPhotos || hasPDFs;

  // Log usage entries for media types included in this call.
  if (logContext?.userId && hasPhotos) {
    logAiUsage({
      userId: logContext.userId,
      sessionId: logContext.sessionId ?? '',
      operation: 'photo_analysis',
      tokensInput: 0,
      tokensOutput: 0,
      estimatedCostUsd: 0,
      modelUsed: 'claude-sonnet-4-6',
    }).catch(() => {});
  }
  if (logContext?.userId && hasPDFs) {
    logAiUsage({
      userId: logContext.userId,
      sessionId: logContext.sessionId ?? '',
      operation: 'ocr',
      tokensInput: 0,
      tokensOutput: 0,
      estimatedCostUsd: 0,
      modelUsed: 'claude-sonnet-4-6',
    }).catch(() => {});
  }

  const systemPrompt = buildSystemPrompt(summaryLevel, language, recordingMode, hasMedia);

  // Build text prompt — media hint lines only appended when files were loaded.
  const photoInfo = hasPhotos
    ? `\n\nI have attached ${imageContents.length} photo(s) from the lecture (whiteboards, slides, handwritten notes). Extract ALL text, formulas, and diagrams from them and include in the notes.`
    : '';
  const pdfInfo = hasPDFs
    ? `\n\nI have attached ${pdfContents.length} PDF document(s) (lecture slides). Incorporate ALL slide content into the notes.`
    : '';

  const userText = `Session title: "${sessionTitle}"\n\nHere is the lecture transcript:\n\n${transcript}${photoInfo}${pdfInfo}`;

  // Build content block array: images → PDFs → text (text last so Claude reads
  // visual materials before the instructions that reference them).
  const userContent: any[] = [];

  if (hasPhotos) {
    for (const img of imageContents) userContent.push(img);
  }
  if (hasPDFs) {
    for (const pdf of pdfContents) userContent.push(pdf);
  }
  userContent.push({ type: 'text', text: userText });

  const headers: Record<string, string> = {
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
  };
  if (hasPDFs) {
    headers['anthropic-beta'] = 'pdfs-2024-09-25';
  }

  const maxTokens =
    summaryLevel === 'minimal' ? 1500 :
    summaryLevel === 'standard' ? 3000 : 6000;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const json = await response.json();
  const rawContent: string = json.content?.[0]?.text ?? '{}';
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: Partial<NoteResult>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${cleaned.slice(0, 200)}`);
  }

  if (logContext?.userId) {
    const inputTokens = estimateTokens(systemPrompt + userText);
    const outputTokens = estimateTokens(rawContent);
    logAiUsage({
      userId: logContext.userId,
      sessionId: logContext.sessionId ?? '',
      operation: 'summarization',
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      estimatedCostUsd: (inputTokens * CLAUDE_PRICE_INPUT_PER_1K + outputTokens * CLAUDE_PRICE_OUTPUT_PER_1K) / 1000,
      modelUsed: 'claude-sonnet-4-20250514',
    }).catch(() => {});
  }

  return {
    suggestedTitle: parsed.suggestedTitle ?? sessionTitle,
    summary: parsed.summary ?? '',
    keyConcepts: parsed.keyConcepts ?? [],
    formulas: parsed.formulas ?? [],
    definitions: parsed.definitions ?? [],
    tags: parsed.tags ?? [],
    unclearParts: parsed.unclearParts ?? [],
    transcriptPreview: parsed.transcriptPreview ?? transcript.slice(0, 500),
  };
}

// -------------------------------------------------------------------
// processSession — routes between real and mock pipelines
// -------------------------------------------------------------------
export async function processSession(params: {
  audioUris: string[];
  language: string;
  summaryLevel: 'minimal' | 'standard' | 'extra';
  sessionTitle: string;
  recordingMode?: string;
  sourceFiles?: MediaFile[];
  logContext?: LogContext;
  onStageChange?: (stage: 'transcribing' | 'generating') => void;
}): Promise<ProcessSessionResult> {
  if (hasAIKeys()) {
    return processSessionReal(params);
  } else {
    return processSessionMock(params);
  }
}

// -------------------------------------------------------------------
// Real pipeline
// -------------------------------------------------------------------
async function processSessionReal(params: {
  audioUris: string[];
  language: string;
  summaryLevel: 'minimal' | 'standard' | 'extra';
  sessionTitle: string;
  recordingMode?: string;
  sourceFiles?: MediaFile[];
  logContext?: LogContext;
  onStageChange?: (stage: 'transcribing' | 'generating') => void;
}): Promise<ProcessSessionResult> {
  params.onStageChange?.('transcribing');
  const transcription = await transcribeAudio({
    audioUris: params.audioUris,
    language: params.language,
    logContext: params.logContext,
  });

  params.onStageChange?.('generating');

  // ── Load source files (photos + PDFs) before note generation ──────
  const photos = (params.sourceFiles ?? []).filter(f => f.file_type === 'photo' && !f.is_deleted);
  const pdfs   = (params.sourceFiles ?? []).filter(f => f.file_type === 'pdf'   && !f.is_deleted);

  const imageContents: any[] = [];
  for (const photo of photos) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(photo.file_path);
      if (fileInfo.exists) {
        const base64 = await FileSystem.readAsStringAsync(photo.file_path, { encoding: 'base64' });
        imageContents.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
        });
      }
    } catch {
      // Skip unreadable file
    }
  }

  const pdfContents: any[] = [];
  for (const pdf of pdfs) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(pdf.file_path);
      if (fileInfo.exists) {
        const base64 = await FileSystem.readAsStringAsync(pdf.file_path, { encoding: 'base64' });
        pdfContents.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        });
      }
    } catch {
      // Skip unreadable file
    }
  }

  const note = await generateNotes({
    transcript: transcription.text,
    summaryLevel: params.summaryLevel,
    sessionTitle: params.sessionTitle,
    language: params.language,
    recordingMode: params.recordingMode,
    imageContents,
    pdfContents,
    logContext: params.logContext,
  });

  const transcriptTokens = estimateTokens(transcription.text);
  const outputTokens = estimateTokens(
    note.summary +
      note.keyConcepts.map(k => k.term + k.explanation).join('') +
      note.definitions.map(d => d.term + d.definition).join(''),
  );

  return { transcription, note, transcriptTokens, outputTokens };
}

// -------------------------------------------------------------------
// Mock pipeline — works without API keys
// -------------------------------------------------------------------
async function processSessionMock(params: {
  audioUris: string[];
  language: string;
  summaryLevel: 'minimal' | 'standard' | 'extra';
  sessionTitle: string;
  recordingMode?: string;
  onStageChange?: (stage: 'transcribing' | 'generating') => void;
}): Promise<ProcessSessionResult> {
  const { language, summaryLevel, sessionTitle, recordingMode, onStageChange } = params;

  // Stage 1 — transcription
  onStageChange?.('transcribing');
  await delay(600);
  await delay(1000);

  const transcription: TranscriptionResult = {
    text: '[Simulated transcript — add your OpenAI API key to enable real transcription]\n\nThis is a placeholder transcript. Once you add your API keys in the .env file, this will be replaced with actual speech-to-text from your lecture recording.\n\nThe app recorded your audio successfully and it is saved locally. You can re-process this session later once API keys are configured.',
    language: language || 'en',
    duration: 0,
    segments: [],
  };

  // Stage 2 — note generation
  onStageChange?.('generating');
  await delay(600);
  await delay(500);
  await delay(300);

  const isMinimal = summaryLevel === 'minimal';
  const isExtra = summaryLevel === 'extra';

  const keyConcepts: KeyConcept[] = isMinimal
    ? [{ term: 'Add API keys for real concepts', explanation: 'Configure your .env file with OpenAI and Anthropic keys.' }]
    : isExtra
    ? [
        { term: 'Add API keys for real concepts', explanation: 'Configure your .env file with OpenAI and Anthropic keys.' },
        { term: 'Real AI extracts actual lecture topics', explanation: 'Whisper converts audio to text; Claude identifies and explains key concepts.' },
        { term: 'Concepts are pulled from your transcript', explanation: 'Every concept shown is grounded in what was actually said in the lecture.' },
        { term: 'Each concept links to what was discussed', explanation: 'With real AI you get direct quotes and context for every concept.' },
      ]
    : [
        { term: 'Add API keys for real concepts', explanation: 'Configure your .env file with OpenAI and Anthropic keys.' },
        { term: 'Real AI extracts actual lecture topics', explanation: 'Whisper converts audio to text; Claude identifies and explains key concepts.' },
        { term: 'Concepts are pulled from your transcript', explanation: 'Every concept shown is grounded in what was actually said in the lecture.' },
      ];

  const note: NoteResult = {
    suggestedTitle: sessionTitle,
    summary: `[Simulated summary for "${sessionTitle}"]\n\nThis is a placeholder summary generated without AI. Add your OpenAI and Anthropic API keys in the .env file to get real AI-powered notes from your lectures.\n\nYour recording and any attached materials have been saved.${isExtra ? '\n\nWith the "Detailed" summary level and real AI, you would get comprehensive notes with thorough explanations, all definitions, formulas with context, and detailed concept breakdowns.' : ''}`,
    keyConcepts,
    formulas: [],
    definitions: [
      {
        term: 'Simulated Mode',
        definition:
          'The app is running without AI API keys. All features work except real transcription and note generation. Add your keys to .env to enable full AI processing.',
      },
    ],
    tags: [
      `#${sessionTitle.split(' ')[0]?.toLowerCase() || 'lecture'}`,
      `#${recordingMode ?? 'standard'}`,
      '#simulated',
    ],
    unclearParts: [
      {
        excerpt: 'Real AI would identify unclear sections of your lecture here',
        reason: 'API keys not configured — run in simulated mode.',
      },
    ],
    transcriptPreview: '[Simulated transcript — add API keys for real content]',
  };

  return { transcription, note, transcriptTokens: 0, outputTokens: 0 };
}

// -------------------------------------------------------------------
// clarifyContent — deeper explanation of highlighted summary parts
// -------------------------------------------------------------------
export async function clarifyContent(params: {
  originalSummary: string;
  highlightedParts: string[];
  fullTranscript?: string;
  language: string;
  logContext?: LogContext;
}): Promise<string> {
  if (!hasAIKeys()) {
    await delay(1500);
    return [
      '[Simulated clarification]',
      '',
      `You highlighted ${params.highlightedParts.length} part(s) for clarification:`,
      '',
      ...params.highlightedParts.map(
        (part, i) =>
          `${i + 1}. "${part.substring(0, 50)}${part.length > 50 ? '...' : ''}" — This would be explained in more detail with real AI.`,
      ),
      '',
      'Add API keys to get real clarifications.',
    ].join('\n');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You are an academic tutor. The student has lecture notes and has highlighted specific parts they want clarified and explained in more detail.

Your job:
- Take each highlighted part and explain it more thoroughly
- Add examples, context, or analogies where helpful
- If the original transcript is provided, use it to give more accurate context
- Keep explanations clear and study-friendly
- Write in ${params.language}
- Number each clarification to match the highlighted parts
- Don't repeat the original summary — only provide the additional explanations`,
      messages: [
        {
          role: 'user',
          content: [
            `Here is my lecture summary:\n\n${params.originalSummary}`,
            `\nI need clarification on these parts:\n\n${params.highlightedParts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}`,
            params.fullTranscript
              ? `\n\nHere is the original transcript for context:\n\n${params.fullTranscript.substring(0, 3000)}`
              : '',
          ].join(''),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const msg: string = (body as any)?.error?.message ?? '';
    if (
      response.status === 429 ||
      response.status === 402 ||
      msg.toLowerCase().includes('credit')
    ) {
      throw new Error('piggy_bank_anthropic');
    }
    throw new Error(msg || 'Clarification failed');
  }

  const data = await response.json();
  const clarifyResult = (data.content as { type: string; text?: string }[])
    .filter(block => block.type === 'text')
    .map(block => block.text ?? '')
    .join('');

  if (params.logContext?.userId) {
    const userMessage = [
      `Here is my lecture summary:\n\n${params.originalSummary}`,
      `\nI need clarification on these parts:\n\n${params.highlightedParts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}`,
      params.fullTranscript
        ? `\n\nHere is the original transcript for context:\n\n${params.fullTranscript.substring(0, 3000)}`
        : '',
    ].join('');
    const inputTokens = estimateTokens(userMessage);
    const outputTokens = estimateTokens(clarifyResult);
    logAiUsage({
      userId: params.logContext.userId,
      sessionId: params.logContext.sessionId ?? '',
      operation: 'summarization',
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      estimatedCostUsd: (inputTokens * CLAUDE_PRICE_INPUT_PER_1K + outputTokens * CLAUDE_PRICE_OUTPUT_PER_1K) / 1000,
      modelUsed: 'claude-sonnet-4-20250514',
    }).catch(() => {});
  }

  return clarifyResult;
}

// -------------------------------------------------------------------
// logAiUsage
// -------------------------------------------------------------------
export async function logAiUsage(params: {
  userId: string;
  sessionId: string;
  operation: 'transcription' | 'summarization' | 'ocr' | 'photo_analysis';
  tokensInput: number;
  tokensOutput: number;
  audioSeconds?: number;
  estimatedCostUsd?: number;
  modelUsed: string;
}): Promise<void> {
  try {
    await run(
      `INSERT INTO ai_usage (id, user_id, session_id, operation, tokens_input, tokens_output,
                             audio_seconds, estimated_cost_usd, model_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        params.userId,
        // The credit-check ping has no session; '' would violate the foreign key.
        params.sessionId || null,
        params.operation,
        Math.round(params.tokensInput),
        Math.round(params.tokensOutput),
        Math.round(params.audioSeconds ?? 0),
        params.estimatedCostUsd ?? 0,
        params.modelUsed,
        now(),
      ],
    );
  } catch (error) {
    // Usage logging is bookkeeping — never fail the AI call it wraps.
    console.warn('[ai.service] Failed to log AI usage:', error);
  }
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function buildModeInstruction(mode?: string): string {
  const m = (mode ?? 'standard').toLowerCase();

  if (m === 'lecture') {
    return `
This recording was made in LECTURE MODE. The audio is primarily from a single speaker (lecturer/professor) delivering academic content. Focus on:
- Extracting the main teaching points and explanations
- Identifying when the lecturer emphasizes something as important
- Ignoring any brief side conversations or student chatter
- Treating the content as a structured academic presentation
- Prioritizing definitions, theorems, and concepts the lecturer explains

If the transcript contains obvious off-topic chatter, side conversations, or non-academic content, skip those parts and focus only on the lecture content.`;
  }

  if (m === 'discussion') {
    return `
This recording was made in DISCUSSION MODE. The audio contains multiple speakers in a group discussion, seminar, or debate format. Focus on:
- Identifying different viewpoints or arguments presented
- Capturing questions and their answers
- Noting points of agreement and disagreement
- Summarizing the key conclusions or takeaways from the discussion
- Treating all speakers' contributions as equally important

Try to attribute different points to different speakers where possible, using labels like "Speaker 1 argued..." or "Another participant suggested..." in the summary.`;
  }

  // standard (default)
  return `
This recording was made in STANDARD MODE. The audio may contain a mix of speakers and content types. Process the transcript as-is without any special filtering. Extract all relevant information equally.`;
}

function buildSystemPrompt(
  level: 'minimal' | 'standard' | 'extra',
  language?: string,
  recordingMode?: string,
  hasMedia = false,
): string {
  const languageInstruction = language && language !== 'auto' && language !== 'en'
    ? `\nIMPORTANT: Write ALL output (titles, summaries, concepts, definitions, tags, etc.) in the same language as the lecture: ${language}.`
    : '';

  const modeInstruction = buildModeInstruction(recordingMode);

  const mediaInstruction = hasMedia ? `
You may receive photos and/or PDF documents alongside the transcript. If photos are provided, extract any visible text, formulas, diagrams, or handwritten notes from them. If PDF slides are provided, incorporate the slide content into your notes. Cross-reference the visual materials with the transcript to create comprehensive notes. If a photo shows a formula or diagram the lecturer discussed, include it in the notes with full context.
` : '';

  const uncertainInstruction = `
IMPORTANT: For any part of the content where you are not confident about accuracy — unclear audio, ambiguous formulas, terms you are not sure about, or contradictory information — mark it clearly by wrapping it in [UNCERTAIN] tags like this: [UNCERTAIN]the content you are unsure about[/UNCERTAIN]. This helps the student know what to double-check.`;

  const base = `You are an expert academic note-taker. Given a lecture transcript, extract structured study notes.${languageInstruction}
${modeInstruction}${mediaInstruction}${uncertainInstruction}

Always respond with ONLY valid JSON (no markdown fences, no extra text) in this exact shape:
{
  "suggestedTitle": "string — concise, descriptive title for the session",
  "summary": "string — prose summary of the lecture",
  "keyConcepts": [{ "term": "string", "explanation": "string" }],
  "formulas": [{ "name": "string", "expression": "string", "description": "string" }],
  "definitions": [{ "term": "string", "definition": "string" }],
  "tags": ["string"],
  "unclearParts": [{ "excerpt": "string", "reason": "string" }],
  "transcriptPreview": "string — first ~300 chars of transcript"
}`;

  if (level === 'minimal') {
    return `${base}

Detail level: MINIMAL. Create a VERY SHORT summary, maximum 3–4 paragraphs. Include ONLY:
- The single most important takeaway
- Up to 3 key concepts (no more)
- Only critical formulas (if any)
- Up to 2 definitions (only the most essential)
- 2–3 tags maximum
This is for quick review before class, not deep study.`;
  }

  if (level === 'standard') {
    return `${base}

Detail level: STANDARD. Create a BALANCED summary, approximately 5–8 paragraphs. Include:
- A comprehensive overview of all topics covered
- All key concepts with brief explanations
- All formulas mentioned with context
- All definitions of new terms
- Relevant tags for organization
- Any parts that were unclear in the recording
This is the default study notes format.`;
  }

  return `${base}

Detail level: DETAILED. Create a COMPREHENSIVE and DETAILED summary, as long as needed. Include:
- Thorough coverage of every topic discussed
- Detailed explanations of each concept with examples if mentioned
- All formulas with full context and how they relate to each other
- Complete definitions with additional context
- Relationships between different concepts discussed
- Step-by-step breakdowns of any processes explained
- All relevant tags
- Detailed notes on unclear sections
- Any questions raised during the lecture and their answers
This is for exam preparation and deep study.`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { WHISPER_MAX_BYTES };
