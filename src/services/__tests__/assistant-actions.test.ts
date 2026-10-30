// Step 6.3 from the app: Ask Claude on a selection and Flashcards from an
// answer (services/assistant-actions), the cards saved (services/flashcards:
// flashcards rows only, no review schedule; Undo trashes them), and an answer
// added to My notes (services/moment-placement: through the editor when it's
// open, else the box saved into My notes). The function is faked; nothing is sent.
import { callFunction, FunctionError } from '../../lib/functions';
import { answer, callsOn, chains, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { askAboutSelection, cardsFromAnswer } from '../assistant-actions.service';
import { ensureConsent, forgetConsent } from '../consent.service';
import { openDocument, saveDocument } from '../document.service';
import { saveFlashcards, savedText } from '../flashcards.service';
import { placeAtMoment, registerMomentTarget } from '../moment-placement';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/functions', () => {
  const actual = jest.requireActual('../../lib/functionResult');
  return { FunctionError: actual.FunctionError, callFunction: jest.fn() };
});
jest.mock('../consent.service', () => ({ ensureConsent: jest.fn(async () => {}), forgetConsent: jest.fn() }));
jest.mock('../document.service', () => ({ openDocument: jest.fn(), saveDocument: jest.fn(async () => {}) }));

const DOC = 'd0000000-0000-4000-8000-000000000001';

beforeEach(() => {
  jest.clearAllMocks();
  resetSupabaseMock();
});

describe('askAboutSelection', () => {
  it('asks consent first, sends the action, the text and its context; a suggestion comes back', async () => {
    (callFunction as jest.Mock).mockResolvedValue({ suggestion: 'Más simple.', model: 'claude-sonnet-5-5' });
    const r = await askAboutSelection({ fileId: DOC, action: 'simpler', text: 'La sinapsis…', context: 'Párrafo.' });
    expect(ensureConsent).toHaveBeenCalledWith('assistant_summary');
    expect(callFunction).toHaveBeenCalledWith('assistant-chat', { mode: 'selection', fileId: DOC, action: 'simpler', text: 'La sinapsis…', context: 'Párrafo.' });
    expect(r).toEqual({ kind: 'suggestion', text: 'Más simple.' });
  });

  it('Make flashcard: the cards', async () => {
    (callFunction as jest.Mock).mockResolvedValue({ cards: [{ front: '¿Sinapsis?', back: 'Unión.' }] });
    expect(await askAboutSelection({ fileId: DOC, action: 'flashcard', text: 'x', context: '' })).toEqual({ kind: 'cards', cards: [{ front: '¿Sinapsis?', back: 'Unión.' }] });
  });

  it('an answer of another shape is an error (nothing to accept)', async () => {
    (callFunction as jest.Mock).mockResolvedValue({ cards: [] });
    await expect(askAboutSelection({ fileId: DOC, action: 'simpler', text: 'x', context: '' })).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('the server’s refusal reaches the screen with its message; consent withdrawn elsewhere is forgotten here', async () => {
    (callFunction as jest.Mock).mockRejectedValueOnce(new FunctionError('Claude can’t help with this text. Nothing was changed.', 422, 'refused'));
    await expect(askAboutSelection({ fileId: DOC, action: 'rewrite', text: 'x', context: '' })).rejects.toMatchObject({ code: 'refused' });
    (callFunction as jest.Mock).mockRejectedValueOnce(new FunctionError('Allow…', 403, 'consent_required'));
    await expect(askAboutSelection({ fileId: DOC, action: 'rewrite', text: 'x', context: '' })).rejects.toMatchObject({ code: 'consent_required' });
    expect(forgetConsent).toHaveBeenCalled();
  });

  it('flashcards from an answer: the lecture and the answer', async () => {
    (callFunction as jest.Mock).mockResolvedValue({ cards: [{ front: 'F', back: 'B' }] });
    expect(await cardsFromAnswer(DOC, 'answer-1', 'texto')).toEqual([{ front: 'F', back: 'B' }]);
    expect(callFunction).toHaveBeenCalledWith('assistant-chat', { mode: 'flashcards', lectureId: DOC, answerId: 'answer-1' });
  });
});

describe('saveFlashcards', () => {
  it('flashcards rows only (no review schedule), with their source; the course read from the document; Undo trashes them', async () => {
    answer('files', { data: { course_id: 'course-1' } });
    answer('flashcards', { data: [{ id: 'c1' }, { id: 'c2' }] });
    const saved = await saveFlashcards(
      [
        { front: 'F1', back: 'B1' },
        { front: 'F2', back: 'B2' },
      ],
      { fileId: DOC, source: 'assistant', sourceRef: 'answer-1' },
    );
    expect(saved.count).toBe(2);
    expect(callsOn('flashcards', 'insert')[0][0]).toEqual([
      { front: 'F1', back: 'B1', file_id: DOC, course_id: 'course-1', source: 'assistant', source_ref: 'answer-1' },
      { front: 'F2', back: 'B2', file_id: DOC, course_id: 'course-1', source: 'assistant', source_ref: 'answer-1' },
    ]);
    expect(chains.some((c) => c.table === 'review_schedule')).toBe(false);
    expect(savedText(2)).toBe('2 flashcards saved');
    expect(savedText(1)).toBe('1 flashcard saved');

    await saved.undo();
    expect(callsOn('flashcards', 'update')[0][0]).toMatchObject({ deleted_at: expect.any(String) });
    expect(callsOn('flashcards', 'in')[0]).toEqual(['id', ['c1', 'c2']]);
  });
});

describe('Add to notes (placeAtMoment)', () => {
  const note = { ms: 1_800_000, question: '¿Qué es el ATP?', answer: 'La energía [25:00].' };

  it('My notes open here: through the editor', async () => {
    const place = jest.fn();
    const off = registerMomentTarget(DOC, { place });
    await placeAtMoment(DOC, { kind: 'answer', note });
    expect(place).toHaveBeenCalledWith({ kind: 'answer', note });
    expect(saveDocument).not.toHaveBeenCalled();
    off();
  });

  it('not open: the box saved at the end of My notes', async () => {
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mi nota' }] }] };
    (openDocument as jest.Mock).mockResolvedValue({ content });
    await placeAtMoment(DOC, { kind: 'answer', note });
    const saved = (saveDocument as jest.Mock).mock.calls[0][0];
    expect(saved).toMatchObject({ fileId: DOC, tab: 'notes', base: content });
    expect(saved.next.content.map((b: { type: string }) => b.type)).toEqual(['paragraph', 'callout', 'paragraph']);
    expect(saved.next.content[1].attrs).toMatchObject({ kind: 'fromAssistant', ms: 1_800_000, origin: 'ai' });
  });
});
