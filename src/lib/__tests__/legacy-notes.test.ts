import {
  CLARIFY_TRANSCRIPT_CHARS,
  MAX_HIGHLIGHTS,
  NOTE_SCHEMA,
  NOTES_MAX_TOKENS,
  clarifySystemPrompt,
  clarifyUserText,
  notesSystemPrompt,
  notesUserText,
  parseNoteResult,
  toBase64,
  validateClarifyFields,
  validateNotesFields,
} from '../../../supabase/functions/_shared/legacy-notes';

const LECTURE = 'd0000000-0000-4000-8000-000000000001';

/** Every object in a structured-outputs schema needs additionalProperties: false and all keys required. */
function checkStrict(schema: Record<string, unknown>, path = 'root'): void {
  if (schema.type === 'object') {
    expect({ path, additionalProperties: schema.additionalProperties }).toEqual({ path, additionalProperties: false });
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(schema.required).toEqual(Object.keys(props));
    for (const [key, value] of Object.entries(props)) checkStrict(value, `${path}.${key}`);
  }
  if (schema.type === 'array') checkStrict(schema.items as Record<string, unknown>, `${path}[]`);
}

describe('NOTE_SCHEMA', () => {
  it('is valid for structured outputs', () => checkStrict(NOTE_SCHEMA));

  it('has the fields the app reads', () => {
    expect(Object.keys(NOTE_SCHEMA.properties)).toEqual([
      'suggestedTitle',
      'summary',
      'keyConcepts',
      'formulas',
      'definitions',
      'tags',
      'unclearParts',
      'transcriptPreview',
    ]);
  });
});

describe('notesSystemPrompt', () => {
  it('asks for the lecture language unless it is English or unknown', () => {
    expect(notesSystemPrompt('standard', 'ca', 'lecture', false)).toContain('in the same language as the lecture: ca');
    expect(notesSystemPrompt('standard', 'en', 'lecture', false)).not.toContain('same language as the lecture');
    expect(notesSystemPrompt('standard', null, 'lecture', false)).not.toContain('same language as the lecture');
  });

  it('includes the mode, the detail level and the [UNCERTAIN] rule', () => {
    const prompt = notesSystemPrompt('minimal', null, 'discussion', false);
    expect(prompt).toContain('DISCUSSION MODE');
    expect(prompt).toContain('Detail level: MINIMAL');
    expect(prompt).toContain('[UNCERTAIN]');
  });

  it('mentions photos and PDFs only when some are sent', () => {
    expect(notesSystemPrompt('extra', null, 'lecture', true)).toContain('PDF slides are provided');
    expect(notesSystemPrompt('extra', null, 'lecture', false)).not.toContain('PDF slides are provided');
  });
});

describe('notesUserText', () => {
  it('puts the title and transcript first, then what was attached', () => {
    const text = notesUserText('Week 3', 'Prices balance supply and demand.', 2, 1);
    expect(text.startsWith('Session title: "Week 3"\n\nHere is the lecture transcript:\n\nPrices balance')).toBe(true);
    expect(text).toContain('attached 2 photo(s)');
    expect(text).toContain('attached 1 PDF document(s)');
  });
});

describe('NOTES_MAX_TOKENS', () => {
  it('leaves room for thinking at every level', () => {
    expect(NOTES_MAX_TOKENS.minimal).toBeGreaterThanOrEqual(4000);
    expect(NOTES_MAX_TOKENS.minimal < NOTES_MAX_TOKENS.standard && NOTES_MAX_TOKENS.standard < NOTES_MAX_TOKENS.extra).toBe(true);
  });
});

describe('parseNoteResult', () => {
  it('reads a full answer', () => {
    const note = parseNoteResult(
      JSON.stringify({
        suggestedTitle: 'Supply and demand',
        summary: 'Prices…',
        keyConcepts: [{ term: 'Equilibrium', explanation: 'Where curves meet' }],
        formulas: [{ name: 'Elasticity', expression: 'ΔQ/ΔP', description: '' }],
        definitions: [],
        tags: ['#econ'],
        unclearParts: [],
        transcriptPreview: 'Prices balance',
      }),
      'Week 3',
      'transcript',
    );
    expect(note).toMatchObject({ suggestedTitle: 'Supply and demand', keyConcepts: [{ term: 'Equilibrium' }], tags: ['#econ'] });
  });

  it('fills what is missing', () => {
    expect(parseNoteResult('{"summary": "x", "tags": ["a", 2]}', 'Week 3', 'abc')).toEqual({
      suggestedTitle: 'Week 3',
      summary: 'x',
      keyConcepts: [],
      formulas: [],
      definitions: [],
      tags: ['a'],
      unclearParts: [],
      transcriptPreview: 'abc',
    });
  });

  it('is null for text that is not a JSON object', () => {
    expect(parseNoteResult('Sorry, I cannot', 'T', '')).toBeNull();
    expect(parseNoteResult('[1, 2]', 'T', '')).toBeNull();
  });
});

describe('clarify prompts', () => {
  it('writes in the lecture language when known', () => {
    expect(clarifySystemPrompt('fr')).toContain('- Write in fr');
    expect(clarifySystemPrompt(null)).toContain('same language as the summary');
  });

  it('numbers the parts and sends only the start of the transcript', () => {
    const text = clarifyUserText('Summary', ['part one', 'part two'], 'x'.repeat(CLARIFY_TRANSCRIPT_CHARS + 500));
    expect(text).toContain('1. "part one"\n2. "part two"');
    expect(text.match(/x+$/)?.[0].length).toBe(CLARIFY_TRANSCRIPT_CHARS);
    expect(clarifyUserText('Summary', ['p'], '')).not.toContain('original transcript');
  });
});

describe('validateNotesFields', () => {
  const ok = { summaryLevel: 'standard', title: ' Week 3 ' };

  it('accepts a notes body and fills the defaults', () => {
    expect(validateNotesFields(LECTURE, ok)).toEqual({
      ok: true,
      value: { lectureId: LECTURE, task: 'notes', summaryLevel: 'standard', recordingMode: 'lecture', title: 'Week 3', includeMedia: false },
    });
  });

  it.each([
    [{ ...ok, summaryLevel: 'huge' }, 'summaryLevel'],
    [{ ...ok, recordingMode: 'podcast' }, 'recordingMode'],
    [{ ...ok, title: 3 }, 'title'],
    [{ ...ok, includeMedia: 'yes' }, 'includeMedia'],
  ])('refuses %o', (body, field) => {
    const result = validateNotesFields(LECTURE, body);
    expect(result).toMatchObject({ ok: false, status: 400, code: 'invalid_request' });
    expect(!result.ok && result.error).toContain(field);
  });
});

describe('validateClarifyFields', () => {
  it('accepts highlighted parts and a summary', () => {
    expect(validateClarifyFields({ highlightedParts: [' a '], summary: 'S' })).toEqual({
      ok: true,
      value: { mode: 'clarify', highlightedParts: ['a'], summary: 'S' },
    });
  });

  it.each([
    [{ highlightedParts: [], summary: 'S' }],
    [{ highlightedParts: Array(MAX_HIGHLIGHTS + 1).fill('a'), summary: 'S' }],
    [{ highlightedParts: ['  '], summary: 'S' }],
    [{ highlightedParts: ['a'], summary: '' }],
  ])('refuses %o', (body) => {
    expect(validateClarifyFields(body)).toMatchObject({ ok: false, code: 'invalid_request' });
  });
});

describe('toBase64', () => {
  it('matches Buffer, also past one chunk', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
