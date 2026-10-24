/**
 * legacy-notes.ts
 * The old app's study notes and "clarify" prompts, moved to the server in
 * step 1.7 so no API key is in the app. Kept free of Deno and network code
 * so Jest can test it (src/lib/__tests__/legacy-notes.test.ts).
 *
 * The prompts are the ones the app sent to Claude itself before 1.7 (from
 * src/services/ai.service.ts), with one change: the note's JSON shape is now
 * enforced with structured outputs (NOTE_SCHEMA) instead of asked for in
 * words. Phase 7's summary engine replaces all of this.
 */

export type SummaryLevel = 'minimal' | 'standard' | 'extra';
export type RecordingMode = 'lecture' | 'standard' | 'discussion';

const LEVELS: SummaryLevel[] = ['minimal', 'standard', 'extra'];
const MODES: RecordingMode[] = ['lecture', 'standard', 'discussion'];

/**
 * Thinking is always on for Claude Opus 5.5 and counts toward max_tokens,
 * so each level gets more room than the old app's 1500 / 3000 / 6000
 * (which were for a model without thinking).
 */
export const NOTES_MAX_TOKENS: Record<SummaryLevel, number> = {
  minimal: 4000,
  standard: 8000,
  extra: 16000,
};

export const CLARIFY_MAX_TOKENS = 4096;

/** Photos and PDFs sent with one notes request, before base64 (Claude takes 32 MB per request). */
export const MAX_MEDIA_BYTES = 24 * 1024 * 1024;

/** How much of the transcript goes with a clarify request (as in the old app). */
export const CLARIFY_TRANSCRIPT_CHARS = 3000;

export const MAX_HIGHLIGHTS = 20;
export const MAX_HIGHLIGHT_CHARS = 2000;
export const MAX_SUMMARY_CHARS = 60000;
export const MAX_TITLE_CHARS = 300;

// -------------------------------------------------------------------
// The note
// -------------------------------------------------------------------

export interface NoteResult {
  suggestedTitle: string;
  summary: string;
  keyConcepts: { term: string; explanation: string }[];
  formulas: { name: string; expression: string; description: string }[];
  definitions: { term: string; definition: string }[];
  tags: string[];
  unclearParts: { excerpt: string; reason: string }[];
  transcriptPreview: string;
}

const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Structured outputs schema: the answer is always JSON of this shape. */
export const NOTE_SCHEMA = obj({
  suggestedTitle: str,
  summary: str,
  keyConcepts: { type: 'array', items: obj({ term: str, explanation: str }) },
  formulas: { type: 'array', items: obj({ name: str, expression: str, description: str }) },
  definitions: { type: 'array', items: obj({ term: str, definition: str }) },
  tags: { type: 'array', items: str },
  unclearParts: { type: 'array', items: obj({ excerpt: str, reason: str }) },
  transcriptPreview: str,
});

function modeInstruction(mode: RecordingMode): string {
  if (mode === 'lecture') {
    return `
This recording was made in LECTURE MODE. The audio is primarily from a single speaker (lecturer/professor) delivering academic content. Focus on:
- Extracting the main teaching points and explanations
- Identifying when the lecturer emphasizes something as important
- Ignoring any brief side conversations or student chatter
- Treating the content as a structured academic presentation
- Prioritizing definitions, theorems, and concepts the lecturer explains

If the transcript contains obvious off-topic chatter, side conversations, or non-academic content, skip those parts and focus only on the lecture content.`;
  }
  if (mode === 'discussion') {
    return `
This recording was made in DISCUSSION MODE. The audio contains multiple speakers in a group discussion, seminar, or debate format. Focus on:
- Identifying different viewpoints or arguments presented
- Capturing questions and their answers
- Noting points of agreement and disagreement
- Summarizing the key conclusions or takeaways from the discussion
- Treating all speakers' contributions as equally important

Try to attribute different points to different speakers where possible, using labels like "Speaker 1 argued..." or "Another participant suggested..." in the summary.`;
  }
  return `
This recording was made in STANDARD MODE. The audio may contain a mix of speakers and content types. Process the transcript as-is without any special filtering. Extract all relevant information equally.`;
}

const LEVEL_INSTRUCTIONS: Record<SummaryLevel, string> = {
  minimal: `Detail level: MINIMAL. Create a VERY SHORT summary, maximum 3–4 paragraphs. Include ONLY:
- The single most important takeaway
- Up to 3 key concepts (no more)
- Only critical formulas (if any)
- Up to 2 definitions (only the most essential)
- 2–3 tags maximum
This is for quick review before class, not deep study.`,
  standard: `Detail level: STANDARD. Create a BALANCED summary, approximately 5–8 paragraphs. Include:
- A comprehensive overview of all topics covered
- All key concepts with brief explanations
- All formulas mentioned with context
- All definitions of new terms
- Relevant tags for organization
- Any parts that were unclear in the recording
This is the default study notes format.`,
  extra: `Detail level: DETAILED. Create a COMPREHENSIVE and DETAILED summary, as long as needed. Include:
- Thorough coverage of every topic discussed
- Detailed explanations of each concept with examples if mentioned
- All formulas with full context and how they relate to each other
- Complete definitions with additional context
- Relationships between different concepts discussed
- Step-by-step breakdowns of any processes explained
- All relevant tags
- Detailed notes on unclear sections
- Any questions raised during the lecture and their answers
This is for exam preparation and deep study.`,
};

/** The notes system prompt. `language` is the lecture's ISO code, or null when Whisper detects it. */
export function notesSystemPrompt(level: SummaryLevel, language: string | null, mode: RecordingMode, hasMedia: boolean): string {
  const languageInstruction =
    language && language !== 'en'
      ? `\nIMPORTANT: Write ALL output (titles, summaries, concepts, definitions, tags, etc.) in the same language as the lecture: ${language}.`
      : '';
  const mediaInstruction = hasMedia
    ? `
You may receive photos and/or PDF documents alongside the transcript. If photos are provided, extract any visible text, formulas, diagrams, or handwritten notes from them. If PDF slides are provided, incorporate the slide content into your notes. Cross-reference the visual materials with the transcript to create comprehensive notes. If a photo shows a formula or diagram the lecturer discussed, include it in the notes with full context.
`
    : '';
  const uncertainInstruction = `
IMPORTANT: For any part of the content where you are not confident about accuracy — unclear audio, ambiguous formulas, terms you are not sure about, or contradictory information — mark it clearly by wrapping it in [UNCERTAIN] tags like this: [UNCERTAIN]the content you are unsure about[/UNCERTAIN]. This helps the student know what to double-check.`;

  return `You are an expert academic note-taker. Given a lecture transcript, extract structured study notes.${languageInstruction}
${modeInstruction(mode)}${mediaInstruction}${uncertainInstruction}

Fields of the notes: suggestedTitle is a concise, descriptive title for the session; summary is a prose summary of the lecture; transcriptPreview is the first ~300 characters of the transcript. Leave a list empty when the lecture has nothing for it (formula descriptions may be empty strings).

${LEVEL_INSTRUCTIONS[level]}`;
}

/** The text part of the notes request (photos and PDFs go before it as their own blocks). */
export function notesUserText(title: string, transcript: string, photoCount: number, pdfCount: number): string {
  const photoInfo = photoCount
    ? `\n\nI have attached ${photoCount} photo(s) from the lecture (whiteboards, slides, handwritten notes). Extract ALL text, formulas, and diagrams from them and include in the notes.`
    : '';
  const pdfInfo = pdfCount
    ? `\n\nI have attached ${pdfCount} PDF document(s) (lecture slides). Incorporate ALL slide content into the notes.`
    : '';
  return `Session title: "${title}"\n\nHere is the lecture transcript:\n\n${transcript}${photoInfo}${pdfInfo}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const list = <T>(v: unknown, pick: (item: Record<string, unknown>) => T): T[] =>
  Array.isArray(v) ? v.filter(isObj).map(pick) : [];

/**
 * Reads Claude's JSON answer into a NoteResult, filling anything missing
 * (structured outputs guarantee the shape, but not after a refusal or a
 * cut-off answer). Returns null when the text isn't JSON at all.
 */
export function parseNoteResult(answer: string, fallbackTitle: string, transcript: string): NoteResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer.trim());
  } catch {
    return null;
  }
  if (!isObj(parsed)) return null;
  return {
    suggestedTitle: text(parsed.suggestedTitle).trim() || fallbackTitle,
    summary: text(parsed.summary),
    keyConcepts: list(parsed.keyConcepts, (c) => ({ term: text(c.term), explanation: text(c.explanation) })),
    formulas: list(parsed.formulas, (f) => ({ name: text(f.name), expression: text(f.expression), description: text(f.description) })),
    definitions: list(parsed.definitions, (d) => ({ term: text(d.term), definition: text(d.definition) })),
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string') : [],
    unclearParts: list(parsed.unclearParts, (u) => ({ excerpt: text(u.excerpt), reason: text(u.reason) })),
    transcriptPreview: text(parsed.transcriptPreview) || transcript.slice(0, 500),
  };
}

// -------------------------------------------------------------------
// Clarify
// -------------------------------------------------------------------

/** The tutor prompt; `language` is the lecture's ISO code, or null. */
export function clarifySystemPrompt(language: string | null): string {
  const write = language ? `- Write in ${language}` : '- Write in the same language as the summary';
  return `You are an academic tutor. The student has lecture notes and has highlighted specific parts they want clarified and explained in more detail.

Your job:
- Take each highlighted part and explain it more thoroughly
- Add examples, context, or analogies where helpful
- If the original transcript is provided, use it to give more accurate context
- Keep explanations clear and study-friendly
${write}
- Number each clarification to match the highlighted parts
- Don't repeat the original summary — only provide the additional explanations`;
}

export function clarifyUserText(summary: string, highlightedParts: string[], transcript: string): string {
  return [
    `Here is my lecture summary:\n\n${summary}`,
    `\nI need clarification on these parts:\n\n${highlightedParts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}`,
    transcript ? `\n\nHere is the original transcript for context:\n\n${transcript.substring(0, CLARIFY_TRANSCRIPT_CHARS)}` : '',
  ].join('');
}

// -------------------------------------------------------------------
// Request bodies
// -------------------------------------------------------------------

type Invalid = { ok: false; status: 400; code: 'invalid_request'; error: string };
const invalid = (error: string): Invalid => ({ ok: false, status: 400, code: 'invalid_request', error });

export interface NotesRequest {
  lectureId: string;
  task: 'notes';
  summaryLevel: SummaryLevel;
  recordingMode: RecordingMode;
  title: string;
  includeMedia: boolean;
}

/** The notes fields of a summarize body ({ lectureId } is checked by validateSummarizeBody). */
export function validateNotesFields(lectureId: string, body: Record<string, unknown>): { ok: true; value: NotesRequest } | Invalid {
  const { summaryLevel, recordingMode, title, includeMedia } = body;
  if (!LEVELS.includes(summaryLevel as SummaryLevel)) return invalid('summaryLevel must be minimal, standard or extra.');
  if (recordingMode !== undefined && !MODES.includes(recordingMode as RecordingMode)) {
    return invalid('recordingMode must be lecture, standard or discussion.');
  }
  if (typeof title !== 'string' || title.length > MAX_TITLE_CHARS) return invalid(`title must be text of at most ${MAX_TITLE_CHARS} characters.`);
  if (includeMedia !== undefined && typeof includeMedia !== 'boolean') return invalid('includeMedia must be true or false.');
  return {
    ok: true,
    value: {
      lectureId,
      task: 'notes',
      summaryLevel: summaryLevel as SummaryLevel,
      recordingMode: (recordingMode as RecordingMode | undefined) ?? 'lecture',
      title: title.trim(),
      includeMedia: includeMedia === true,
    },
  };
}

export interface ClarifyFields {
  mode: 'clarify';
  highlightedParts: string[];
  summary: string;
}

/** The clarify fields of an assistant-chat body: { mode: 'clarify', highlightedParts, summary }. */
export function validateClarifyFields(body: Record<string, unknown>): { ok: true; value: ClarifyFields } | Invalid {
  const { highlightedParts, summary } = body;
  if (!Array.isArray(highlightedParts) || highlightedParts.length === 0 || highlightedParts.length > MAX_HIGHLIGHTS) {
    return invalid(`highlightedParts must list 1 to ${MAX_HIGHLIGHTS} parts.`);
  }
  if (!highlightedParts.every((p) => typeof p === 'string' && p.trim() && p.length <= MAX_HIGHLIGHT_CHARS)) {
    return invalid(`Each highlighted part must be text of at most ${MAX_HIGHLIGHT_CHARS} characters.`);
  }
  if (typeof summary !== 'string' || !summary.trim() || summary.length > MAX_SUMMARY_CHARS) {
    return invalid(`summary must be text of at most ${MAX_SUMMARY_CHARS} characters.`);
  }
  return { ok: true, value: { mode: 'clarify', highlightedParts: highlightedParts.map((p) => p.trim()), summary } };
}

// -------------------------------------------------------------------
// Files
// -------------------------------------------------------------------

/** Bytes → base64 in chunks (btoa on one huge string overflows the call stack). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
