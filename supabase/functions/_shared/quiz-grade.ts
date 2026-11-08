/**
 * quiz-grade.ts
 * Step 9.1b-3: grading a quiz answer in code (the approved plan §2), the same on the iPhone (offline
 * too), the laptop and the server. Without imports, so the app, Jest and the quiz function use it.
 *
 * | Type | Right | Partly | Points |
 * | multiple choice, true/false | the right option | — | 1 / 0 |
 * | calculation | within the question's tolerance (none: ±0.5 % and half a unit of its last decimal) | — | 1 / 0 |
 * | put in order | every step in place | ≥ half in place | in place / steps |
 * | match pairs | every pair right | ≥ half right | right pairs / pairs |
 * | fill in the blank | every blank right | some | right blanks / blanks |
 * | short answer | the model answer (as the blanks are compared), else the AI | the AI | 1 / 0.5 / 0 |
 * | long answer | the AI | the AI | 1 / 0.5 / 0 |
 *
 * Numbers: Spanish and English formats ("1.234,5", "1,234.5"; "1.234" read both ways), "3/4",
 * "1,2e3", a % or a unit after the number ignored. Words: case, accents, outer punctuation and
 * spaces ignored; one typo allowed in a word of 6+ letters, two in 10+; numbers compared as numbers.
 * An unanswered question (no response, or an empty one) is wrong.
 */

export type Verdict = 'correct' | 'partly' | 'wrong';
export type QuizQuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank' | 'long_answer' | 'match_pairs' | 'order_steps' | 'numeric';

/**
 * Her answer, per type: multiple choice the option's index (as stored); true/false the value;
 * short, long and calculation the text; blanks each blank's text; match pairs, for each left item
 * (stored order) the index of the stored pair whose right item she chose; put in order the stored
 * steps' indexes in the order she put them.
 */
export type QuizResponse = { choice: number } | { value: boolean } | { text: string } | { blanks: string[] } | { matches: (number | null)[] } | { order: number[] };

export type Graded = { verdict: Verdict; points: number } | { verdict: 'pending'; points: 0 };

/** The questions graded by the AI when code can't: short answers it can't match, every long answer. */
export const AI_GRADED: readonly QuizQuestionType[] = ['short_answer', 'long_answer'];

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .replace(/^[\s.,;:!?¡¿"'«»()[\]-]+|[\s.,;:!?¡¿"'«»()[\]-]+$/g, '');

/** Edits (insert, delete, replace) from a to b, stopping above `max`. */
function editsWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...row) > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/** Typos a word of this length may have: none under 6 letters, one from 6, two from 10. */
export const typosAllowed = (word: string) => (word.length >= 10 ? 2 : word.length >= 6 ? 1 : 0);

/**
 * A written number's readings (Spanish and English formats): "1.234" → 1.234 and 1234, "1,5" → 1.5,
 * "1.234,5" → 1234.5, "3/4" → 0.75, "1,2e3" → 1200, "12,5 %" → 12.5, "3 m" → 3. None: [].
 */
export function numberForms(text: string): number[] {
  const t = text.trim().replace(/−/g, '-').replace(/[\s ](?=\d{3}\b)/g, '');
  const m = /^([-+]?)(\d[\d.,]*|[.,]\d+)(?:[eE]([-+]?\d+))?(?:\s*\/\s*(\d+(?:[.,]\d+)?))?/.exec(t);
  if (!m) return [];
  const sign = m[1] === '-' ? -1 : 1;
  const exp = m[3] ? 10 ** Number(m[3]) : 1;
  const readings = mantissa(m[2]).map((n) => sign * n * exp);
  if (m[4]) {
    const den = mantissa(m[4])[0];
    return den ? readings.map((n) => n / den) : [];
  }
  return [...new Set(readings.map((n) => Math.round(n * 1e9) / 1e9))].filter(Number.isFinite);
}

function mantissa(token: string): number[] {
  const t = token.replace(/[.,]$/, '');
  const both = t.includes('.') && t.includes(',');
  if (both) {
    const dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    const n = Number(t.replace(dec === '.' ? /,/g : /\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? [n] : [];
  }
  const sep = t.includes('.') ? '.' : t.includes(',') ? ',' : null;
  if (!sep) return Number.isFinite(Number(t)) ? [Number(t)] : [];
  const parts = t.split(sep);
  const out: number[] = [];
  if (parts.length === 2) out.push(Number(`${parts[0] || '0'}.${parts[1]}`));
  if (parts.length >= 2 && parts.slice(1).every((p) => p.length === 3) && parts[0].length > 0) out.push(Number(parts.join('')));
  return out.filter(Number.isFinite);
}

/** Whether a written text matches an expected one: as words (case, accents, typos) or, both numbers, as numbers. */
export function textMatches(given: string, expected: string): boolean {
  const g = plain(given);
  const e = plain(expected);
  if (!g || !e) return false;
  if (g === e) return true;
  const gn = numberForms(g);
  const en = numberForms(e);
  const wholeNumber = (s: string) => /^[-+]?[\d.,\s/%eE]+$/.test(s);
  if (wholeNumber(g) && wholeNumber(e) && gn.length && en.length) return gn.some((a) => en.some((b) => Math.abs(a - b) < 1e-9));
  const gw = g.split(' ');
  const ew = e.split(' ');
  return gw.length === ew.length && gw.every((w, i) => editsWithin(w, ew[i], typosAllowed(ew[i])));
}

/** Whether a response says nothing (an empty field, nothing chosen): unanswered. */
export function isEmptyResponse(r: QuizResponse | null | undefined): boolean {
  if (!r) return true;
  if ('text' in r) return !r.text.trim();
  if ('blanks' in r) return r.blanks.every((b) => !b.trim());
  if ('matches' in r) return r.matches.every((m) => m === null);
  if ('order' in r) return r.order.length === 0;
  // {}: a question left unanswered (the column is never SQL null).
  return !('choice' in r) && !('value' in r);
}

const share = (right: number, total: number): Graded => {
  if (total <= 0) return { verdict: 'wrong', points: 0 };
  const points = Math.round((right / total) * 1000) / 1000;
  return { verdict: right === total ? 'correct' : right * 2 >= total ? 'partly' : 'wrong', points };
};

/** A numeric answer's allowed distance (the approved rule). */
export function numericAllowance(d: { answer: number; tolerance: number; relative: boolean; decimals: number }): number {
  if (d.tolerance > 0) return d.relative ? d.tolerance * Math.abs(d.answer) : d.tolerance;
  return Math.max(0.005 * Math.abs(d.answer), 0.5 * 10 ** -Math.max(0, d.decimals ?? 0));
}

/**
 * An answer graded in code: its verdict and points, or `pending` for the AI (a short answer code
 * can't match, every long answer). Unanswered: wrong.
 */
export function gradeAnswer(type: QuizQuestionType, data: Record<string, unknown>, response: QuizResponse | null | undefined): Graded {
  if (isEmptyResponse(response)) return { verdict: 'wrong', points: 0 };
  const r = response as Record<string, unknown>;
  const d = data as Record<string, never>;
  switch (type) {
    case 'multiple_choice':
      return r.choice === d.correct ? { verdict: 'correct', points: 1 } : { verdict: 'wrong', points: 0 };
    case 'true_false':
      return r.value === d.correct ? { verdict: 'correct', points: 1 } : { verdict: 'wrong', points: 0 };
    case 'numeric': {
      const n = d as unknown as { answer: number; tolerance: number; relative: boolean; decimals: number };
      const allowed = numericAllowance(n) + 1e-9;
      return numberForms(String(r.text)).some((x) => Math.abs(x - n.answer) <= allowed) ? { verdict: 'correct', points: 1 } : { verdict: 'wrong', points: 0 };
    }
    case 'fill_blank': {
      const blanks = (d.blanks as { answer: string; accept: string[] }[]) ?? [];
      const given = (r.blanks as string[]) ?? [];
      const right = blanks.filter((b, i) => [b.answer, ...(b.accept ?? [])].some((e) => textMatches(given[i] ?? '', e))).length;
      return right === blanks.length ? { verdict: 'correct', points: 1 } : right > 0 ? { verdict: 'partly', points: Math.round((right / blanks.length) * 1000) / 1000 } : { verdict: 'wrong', points: 0 };
    }
    case 'match_pairs': {
      const pairs = (d.pairs as unknown[]) ?? [];
      const matches = (r.matches as (number | null)[]) ?? [];
      return share(pairs.filter((_, i) => matches[i] === i).length, pairs.length);
    }
    case 'order_steps': {
      const steps = (d.steps as unknown[]) ?? [];
      const order = (r.order as number[]) ?? [];
      return share(steps.filter((_, i) => order[i] === i).length, steps.length);
    }
    case 'short_answer':
      return textMatches(String(r.text), String(d.modelAnswer ?? '')) ? { verdict: 'correct', points: 1 } : { verdict: 'pending', points: 0 };
    case 'long_answer':
      return { verdict: 'pending', points: 0 };
  }
}

/** The points an AI or student verdict is worth on a short or long answer, or any answer she re-grades: 1 / 0.5 / 0. */
export const verdictPoints = (v: Verdict) => (v === 'correct' ? 1 : v === 'partly' ? 0.5 : 0);

/** Her answer as words (the results, and what the AI reads). */
export function responseText(type: QuizQuestionType, data: Record<string, unknown>, response: QuizResponse | null | undefined): string {
  if (isEmptyResponse(response)) return '';
  const r = response as Record<string, unknown>;
  const d = data as Record<string, never>;
  switch (type) {
    case 'multiple_choice':
      return String((d.options as string[])?.[r.choice as number] ?? '');
    case 'true_false':
      return r.value ? 'True' : 'False';
    case 'fill_blank':
      return ((r.blanks as string[]) ?? []).map((b) => b.trim() || '—').join(' · ');
    case 'match_pairs': {
      const pairs = (d.pairs as { left: string; right: string }[]) ?? [];
      return pairs.map((p, i) => `${p.left} → ${pairs[(r.matches as (number | null)[])[i] ?? -1]?.right ?? '—'}`).join('; ');
    }
    case 'order_steps': {
      const steps = (d.steps as string[]) ?? [];
      return ((r.order as number[]) ?? []).map((k, i) => `${i + 1}. ${steps[k] ?? ''}`).join(' ');
    }
    default:
      return String(r.text ?? '');
  }
}
