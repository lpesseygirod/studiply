/**
 * context.ts
 * Where the cursor is in a formula being typed (step 4.7e), read with the
 * engine's own tokenizer, so text in quotes, nested calls and $A$1 are
 * understood exactly as when the formula is calculated:
 *   - the function the cursor is in and which of its arguments, for the
 *     help line (PMT(rate, **nper**, pv));
 *   - the letters being typed where a function name can go (autocomplete);
 *   - whether clicking a cell may add its reference here (after "=", "(",
 *     ",", ":" or an operator), and the reference just before the cursor,
 *     which a new click replaces (as in Excel).
 * Only the text before the cursor is read; what follows it doesn't matter.
 */

import { FormulaSyntaxError, tokenize, type Token } from './parser';

export interface FormulaContext {
  /** The innermost function the cursor is in (upper case, known or not), or null. */
  fn: string | null;
  /** Which of its arguments (0 = the first). */
  arg: number;
  /** The cursor is inside quotes. */
  inString: boolean;
  /** Letters being typed where a function name can go, and where they start in the input. */
  partial: { text: string; start: number } | null;
  /** A reference may be added at the cursor. */
  canInsertRef: boolean;
  /** A reference or range (A1, $B$2:B9) ending at the cursor, in the input's positions. */
  ref: { start: number; end: number } | null;
}

/** Where the text in quotes that isn't closed starts, or -1. */
function openQuote(text: string): number {
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    if (open < 0) open = i;
    else if (text[i + 1] === '"') i++;
    else open = -1;
  }
  return open;
}

const CAN_PRECEDE_REF = (t: Token | undefined) => !t || t.kind === 'lparen' || t.kind === 'comma' || t.kind === 'colon' || (t.kind === 'op' && t.text !== '%');

/**
 * The context at `cursor` in a cell's input ("=PMT(B1/12, " with the cursor
 * at the end). Null when the input isn't a formula or the cursor is on its "=".
 */
export function formulaContext(input: string, cursor: number): FormulaContext | null {
  if (!input.startsWith('=') || cursor < 1) return null;
  let before = input.slice(1, Math.min(cursor, input.length));
  const quote = openQuote(before);
  const inString = quote >= 0;
  if (inString) before = before.slice(0, quote);

  let tokens: Token[];
  try {
    tokens = tokenize(before);
  } catch (e) {
    if (!(e instanceof FormulaSyntaxError)) throw e;
    return { fn: null, arg: 0, inString, partial: null, canInsertRef: false, ref: null };
  }

  // Each open bracket: the function it belongs to (null for plain brackets) and the argument reached.
  const frames: { fn: string | null; arg: number }[] = [];
  tokens.forEach((t, i) => {
    if (t.kind === 'lparen') frames.push({ fn: tokens[i - 1]?.kind === 'func' ? tokens[i - 1].text.toUpperCase() : null, arg: 0 });
    else if (t.kind === 'rparen') frames.pop();
    else if (t.kind === 'comma' && frames.length) frames[frames.length - 1].arg++;
  });
  let named: { fn: string | null; arg: number } | undefined;
  for (let i = frames.length - 1; i >= 0 && !named; i--) if (frames[i].fn) named = frames[i];

  const base = { fn: named?.fn ?? null, arg: named?.arg ?? 0, inString };
  if (inString) return { ...base, partial: null, canInsertRef: false, ref: null };

  const last = tokens[tokens.length - 1];
  const touching = last && last.end === before.length; // nothing (not even a space) between it and the cursor
  const offset = 1; // the "="

  // Letters typed where a value starts: a function name in the making (PM → PMT).
  let partial: FormulaContext['partial'] = null;
  if (touching && (last.kind === 'name' || last.kind === 'ref' || last.kind === 'boolean') && /^[A-Za-z][A-Za-z0-9.]*$/.test(last.text) && CAN_PRECEDE_REF(tokens[tokens.length - 2])) {
    partial = { text: last.text, start: last.start + offset };
  }

  // A reference (or range) right before the cursor: a new click replaces it.
  let ref: FormulaContext['ref'] = null;
  if (touching && last.kind === 'ref') {
    const n = tokens.length;
    const isRange = n >= 3 && tokens[n - 2].kind === 'colon' && tokens[n - 3].kind === 'ref';
    const first = isRange ? tokens[n - 3] : last;
    if (CAN_PRECEDE_REF(tokens[tokens.indexOf(first) - 1])) ref = { start: first.start + offset, end: last.end + offset };
  }

  return { ...base, partial, canInsertRef: CAN_PRECEDE_REF(last) || ref !== null, ref };
}
