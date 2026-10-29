/**
 * parser.ts
 * Formula text → a tree the evaluator can compute.
 *
 * The text is what follows the "=" (`SUM(A1:A5)*2`). Operators, from the
 * one applied first to the one applied last, as in Excel:
 *   :  range            A1:B5
 *   -  negation         -2^2 is 4, because negation comes before ^
 *   %  percent          50% is 0.5
 *   ^  power            2^3^2 is 64 (left to right)
 *   *  /
 *   +  -
 *   &  joins text
 *   =  <>  <  >  <=  >=
 * Function names and cell addresses may be typed in any case. An argument
 * may be left out (`PV(8%/12, 240, 500, , 0)`); it reads as empty.
 * Spaces are ignored. Arguments are separated with commas and decimals
 * written with a point, whatever the lecture's language.
 */

import { parseCellRef, type CellRef } from './address';
import { errorCodeOf, parseNumber, type ErrorCode } from './values';

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

export type Node =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; code: ErrorCode }
  | { type: 'ref'; ref: CellRef }
  | { type: 'range'; start: CellRef; end: CellRef }
  | { type: 'name'; name: string }
  | { type: 'empty' }
  | { type: 'paren'; inner: Node }
  | { type: 'unary'; op: '-' | '+'; operand: Node }
  | { type: 'percent'; operand: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] };

export type TokenKind =
  | 'number'
  | 'string'
  | 'boolean'
  | 'error'
  | 'ref'
  | 'func'
  | 'name'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'colon';

/** A piece of formula text; `start` and `end` are its position in the text (copy.ts rewrites refs in place). */
export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

export class FormulaSyntaxError extends Error {}

const OPERATORS = ['<>', '<=', '>=', '+', '-', '*', '/', '^', '&', '%', '=', '<', '>'];
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_.$]*/y;
const NUMBER = /(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/y;
const ERROR_LITERAL = /#(DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|ERROR!)/iy;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, end: number) => {
    tokens.push({ kind, text: text.slice(i, end), start: i, end });
    i = end;
  };
  const matchAt = (re: RegExp): string | null => {
    re.lastIndex = i;
    return re.exec(text)?.[0] ?? null;
  };

  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= text.length) throw new FormulaSyntaxError('Text is missing its closing quote');
        if (text[j] === '"') {
          if (text[j + 1] === '"') j += 2;
          else break;
        } else j++;
      }
      push('string', j + 1);
      continue;
    }
    if (ch === '(') {
      push('lparen', i + 1);
      continue;
    }
    if (ch === ')') {
      push('rparen', i + 1);
      continue;
    }
    if (ch === ',') {
      push('comma', i + 1);
      continue;
    }
    if (ch === ':') {
      push('colon', i + 1);
      continue;
    }
    if (ch === '#') {
      const err = matchAt(ERROR_LITERAL);
      if (!err) throw new FormulaSyntaxError(`Unknown error value at "${text.slice(i, i + 8)}"`);
      push('error', i + err.length);
      continue;
    }
    const num = matchAt(NUMBER);
    if (num) {
      push('number', i + num.length);
      continue;
    }
    const word = matchAt(IDENTIFIER);
    if (word) {
      let next = i + word.length;
      while (next < text.length && /\s/.test(text[next])) next++;
      const upper = word.toUpperCase();
      if (text[next] === '(' && !word.includes('$')) push('func', i + word.length);
      else if (parseCellRef(word)) push('ref', i + word.length);
      else if (upper === 'TRUE' || upper === 'FALSE') push('boolean', i + word.length);
      else push('name', i + word.length);
      continue;
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i));
    if (op) {
      push('op', i + op.length);
      continue;
    }
    throw new FormulaSyntaxError(`Unexpected "${ch}"`);
  }
  return tokens;
}

const COMPARISON = ['=', '<>', '<', '>', '<=', '>='];

/** Parses formula text (without its leading "="); throws FormulaSyntaxError when it can't be read. */
export function parseFormula(text: string): Node {
  const tokens = tokenize(text);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const isOp = (ops: string[]) => {
    const t = peek();
    return t?.kind === 'op' && ops.includes(t.text);
  };

  const binaryLevel = (ops: string[], next: () => Node) => (): Node => {
    let left = next();
    while (isOp(ops)) {
      const op = tokens[pos++].text as BinaryOp;
      left = { type: 'binary', op, left, right: next() };
    }
    return left;
  };

  const primary = (): Node => {
    const t = tokens[pos++];
    if (!t) throw new FormulaSyntaxError('The formula ends too early');
    switch (t.kind) {
      case 'number': {
        const value = parseNumber(t.text);
        if (value === null) throw new FormulaSyntaxError(`"${t.text}" is too large a number`);
        return { type: 'number', value };
      }
      case 'string':
        return { type: 'string', value: t.text.slice(1, -1).replace(/""/g, '"') };
      case 'boolean':
        return { type: 'boolean', value: t.text.toUpperCase() === 'TRUE' };
      case 'error':
        return { type: 'error', code: errorCodeOf(t.text)! };
      case 'name':
        return { type: 'name', name: t.text };
      case 'ref': {
        const start = parseCellRef(t.text)!;
        if (peek()?.kind !== 'colon') return { type: 'ref', ref: start };
        pos++;
        const endToken = tokens[pos++];
        if (endToken?.kind !== 'ref') throw new FormulaSyntaxError('A range needs a cell after ":"');
        return { type: 'range', start, end: parseCellRef(endToken.text)! };
      }
      case 'func':
        return call(t.text.toUpperCase());
      case 'lparen': {
        const inner = expression();
        if (tokens[pos++]?.kind !== 'rparen') throw new FormulaSyntaxError('Missing ")"');
        return { type: 'paren', inner };
      }
      default:
        throw new FormulaSyntaxError(`Unexpected "${t.text}"`);
    }
  };

  const call = (name: string): Node => {
    pos++; // the "("
    const args: Node[] = [];
    if (peek()?.kind === 'rparen') {
      pos++;
      return { type: 'call', name, args };
    }
    for (;;) {
      const t = peek();
      args.push(t?.kind === 'comma' || t?.kind === 'rparen' ? { type: 'empty' } : expression());
      const sep = tokens[pos++];
      if (sep?.kind === 'rparen') return { type: 'call', name, args };
      if (sep?.kind !== 'comma') throw new FormulaSyntaxError(`Missing ")" after the arguments of ${name}`);
    }
  };

  const unary = (): Node => {
    if (isOp(['-', '+'])) {
      const op = tokens[pos++].text as '-' | '+';
      return { type: 'unary', op, operand: unary() };
    }
    return primary();
  };

  const percent = (): Node => {
    let node = unary();
    while (isOp(['%'])) {
      pos++;
      node = { type: 'percent', operand: node };
    }
    return node;
  };

  const power = binaryLevel(['^'], percent);
  const product = binaryLevel(['*', '/'], power);
  const sum = binaryLevel(['+', '-'], product);
  const concat = binaryLevel(['&'], sum);
  const expression = binaryLevel(COMPARISON, concat);

  if (tokens.length === 0) throw new FormulaSyntaxError('The formula is empty');
  const tree = expression();
  if (pos < tokens.length) throw new FormulaSyntaxError(`Unexpected "${tokens[pos].text}"`);
  return tree;
}
