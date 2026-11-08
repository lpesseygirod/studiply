/**
 * @jest-environment node
 */
// Step 9.1b-3: grading in code (quiz-grade.ts, the approved plan §2), the same on the iPhone, the
// laptop and the server: every type, numbers in Spanish and English formats, typos by word length,
// partly by share, short answers code can't match (and every long one) left to the AI, unanswered wrong.
import {
  AI_GRADED,
  gradeAnswer,
  isEmptyResponse,
  numberForms,
  numericAllowance,
  responseText,
  textMatches,
  typosAllowed,
  verdictPoints,
} from '../../../supabase/functions/_shared/quiz-grade';

describe('numbers as she writes them', () => {
  it('Spanish and English formats; "1.234" read both ways; fractions, exponents, % and units', () => {
    expect(numberForms('1,5')).toEqual([1.5]);
    expect(numberForms('1.234,5')).toEqual([1234.5]);
    expect(numberForms('1,234.5')).toEqual([1234.5]);
    expect(numberForms('1.234').sort((a, b) => a - b)).toEqual([1.234, 1234]);
    expect(numberForms('3/4')).toEqual([0.75]);
    expect(numberForms('1,2e3')).toEqual([1200]);
    expect(numberForms('12,5 %')).toEqual([12.5]);
    expect(numberForms('3 m')).toEqual([3]);
    expect(numberForms('−2,5')).toEqual([-2.5]);
    expect(numberForms('1 234')).toEqual([1234]);
    expect(numberForms('tres')).toEqual([]);
  });

  it('the allowance: the question’s tolerance (relative or absolute), else ±0.5 % and half a unit of the last decimal', () => {
    expect(numericAllowance({ answer: 200, tolerance: 0.01, relative: true, decimals: 0 })).toBeCloseTo(2);
    expect(numericAllowance({ answer: 200, tolerance: 0.5, relative: false, decimals: 0 })).toBe(0.5);
    expect(numericAllowance({ answer: 200, tolerance: 0, relative: false, decimals: 0 })).toBe(1);
    expect(numericAllowance({ answer: 2, tolerance: 0, relative: false, decimals: 2 })).toBeCloseTo(0.01);
  });
});

describe('words', () => {
  it('case, accents, outer punctuation and spaces ignored; typos by word length (0 under 6, 1 from 6, 2 from 10)', () => {
    expect(typosAllowed('cinco')).toBe(0);
    expect(typosAllowed('memoria')).toBe(1);
    expect(typosAllowed('psicobiología')).toBe(2);
    expect(textMatches('  Evolución. ', 'evolucion')).toBe(true);
    expect(textMatches('memorria', 'memoria')).toBe(true);
    expect(textMatches('memorrria', 'memoria')).toBe(false);
    expect(textMatches('cinko', 'cinco')).toBe(false);
    expect(textMatches('psicobiolgia', 'psicobiología')).toBe(true);
    expect(textMatches('la memoria', 'memoria')).toBe(false);
    expect(textMatches('', 'memoria')).toBe(false);
  });

  it('numbers compared as numbers ("0,5" is "0.5"; "5" isn’t "6")', () => {
    expect(textMatches('0,5', '0.5')).toBe(true);
    expect(textMatches('5', '6')).toBe(false);
  });
});

describe('gradeAnswer', () => {
  it('multiple choice and true/false: the right option, 1 or 0', () => {
    expect(gradeAnswer('multiple_choice', { options: ['a', 'b'], correct: 1 }, { choice: 1 })).toEqual({ verdict: 'correct', points: 1 });
    expect(gradeAnswer('multiple_choice', { options: ['a', 'b'], correct: 1 }, { choice: 0 })).toEqual({ verdict: 'wrong', points: 0 });
    expect(gradeAnswer('true_false', { correct: false }, { value: false })).toEqual({ verdict: 'correct', points: 1 });
    expect(gradeAnswer('true_false', { correct: false }, { value: true })).toEqual({ verdict: 'wrong', points: 0 });
  });

  it('a calculation: within the tolerance, written either way', () => {
    const d = { answer: 1234.5, tolerance: 0.1, relative: false, unit: 'J', decimals: 1 };
    expect(gradeAnswer('numeric', d, { text: '1.234,5 J' }).verdict).toBe('correct');
    expect(gradeAnswer('numeric', d, { text: '1234.58' }).verdict).toBe('correct');
    expect(gradeAnswer('numeric', d, { text: '1235' }).verdict).toBe('wrong');
    expect(gradeAnswer('numeric', d, { text: 'mil' }).verdict).toBe('wrong');
  });

  it('fill in the blank: all right correct; some partly by share (accepted variants count)', () => {
    const d = { text: '___ y ___', blanks: [{ answer: 'neurona', accept: ['neuronas'] }, { answer: 'sinapsis', accept: [] }] };
    expect(gradeAnswer('fill_blank', d, { blanks: ['Neuronas', 'sinapsis'] })).toEqual({ verdict: 'correct', points: 1 });
    expect(gradeAnswer('fill_blank', d, { blanks: ['neurona', 'axón'] })).toEqual({ verdict: 'partly', points: 0.5 });
    expect(gradeAnswer('fill_blank', d, { blanks: ['x', 'y'] })).toEqual({ verdict: 'wrong', points: 0 });
  });

  it('match pairs and put in order: by share, partly from half', () => {
    const pairs = { pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }, { left: 'd', right: '4' }] };
    expect(gradeAnswer('match_pairs', pairs, { matches: [0, 1, 2, 3] })).toEqual({ verdict: 'correct', points: 1 });
    expect(gradeAnswer('match_pairs', pairs, { matches: [0, 1, 3, 2] })).toEqual({ verdict: 'partly', points: 0.5 });
    expect(gradeAnswer('match_pairs', pairs, { matches: [0, null, null, null] })).toEqual({ verdict: 'wrong', points: 0.25 });
    const steps = { steps: ['s0', 's1', 's2'] };
    expect(gradeAnswer('order_steps', steps, { order: [0, 1, 2] }).verdict).toBe('correct');
    expect(gradeAnswer('order_steps', steps, { order: [0, 2, 1] })).toEqual({ verdict: 'wrong', points: 0.333 });
    expect(gradeAnswer('order_steps', { steps: ['a', 'b', 'c', 'd'] }, { order: [0, 1, 3, 2] }).verdict).toBe('partly');
  });

  it('a short answer: the model answer matched in code, else left to the AI; a long answer always the AI’s', () => {
    expect(AI_GRADED).toEqual(['short_answer', 'long_answer']);
    expect(gradeAnswer('short_answer', { modelAnswer: 'La memoria' }, { text: 'la memoria' })).toEqual({ verdict: 'correct', points: 1 });
    expect(gradeAnswer('short_answer', { modelAnswer: 'La memoria' }, { text: 'recordar cosas' })).toEqual({ verdict: 'pending', points: 0 });
    expect(gradeAnswer('long_answer', { modelAnswer: '…', keyPoints: [] }, { text: 'Un párrafo.' })).toEqual({ verdict: 'pending', points: 0 });
  });

  it('unanswered (no response, {} as stored, an empty field, nothing chosen): wrong, never sent to the AI', () => {
    expect(isEmptyResponse(null)).toBe(true);
    expect(isEmptyResponse({} as never)).toBe(true);
    expect(isEmptyResponse({ text: '  ' })).toBe(true);
    expect(isEmptyResponse({ matches: [null, null] })).toBe(true);
    expect(isEmptyResponse({ choice: 0 })).toBe(false);
    expect(isEmptyResponse({ value: false })).toBe(false);
    expect(gradeAnswer('long_answer', {}, { text: '' })).toEqual({ verdict: 'wrong', points: 0 });
    expect(gradeAnswer('short_answer', {}, null)).toEqual({ verdict: 'wrong', points: 0 });
  });

  it('her grade’s points: 1 / 0.5 / 0', () => {
    expect([verdictPoints('correct'), verdictPoints('partly'), verdictPoints('wrong')]).toEqual([1, 0.5, 0]);
  });
});

describe('responseText (the results, and what the AI reads)', () => {
  it('every type as words', () => {
    expect(responseText('multiple_choice', { options: ['Memoria', 'Evolución'] }, { choice: 1 })).toBe('Evolución');
    expect(responseText('true_false', {}, { value: false })).toBe('False');
    expect(responseText('fill_blank', {}, { blanks: ['neurona', ''] })).toBe('neurona · —');
    expect(responseText('match_pairs', { pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }] }, { matches: [1, null] })).toBe('a → 2; b → —');
    expect(responseText('order_steps', { steps: ['x', 'y'] }, { order: [1, 0] })).toBe('1. y 2. x');
    expect(responseText('long_answer', {}, { text: 'Hola' })).toBe('Hola');
    expect(responseText('short_answer', {}, {} as never)).toBe('');
  });
});
