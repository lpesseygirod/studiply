/**
 * Maths typed as plain text (after test B, Lea): what looks like a formula
 * (x^2, x_1, a/b, sqrt(x), alpha…) gets a "Make formula" suggestion; it
 * never turns into one on its own (AI and automatic changes never apply
 * silently). Pure functions; the plugin is in schema/formula.ts.
 */

const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'rho', 'sigma', 'tau', 'phi', 'omega', 'Delta', 'Sigma', 'Omega', 'Pi'];
/** Things written with a slash that aren't fractions. */
const NOT_FRACTIONS = new Set(['and/or', 'y/o', 'km/h', 'm/s', 'w/o', 'n/a', 'he/she', 'él/ella']);
/** One piece of a formula: a number, a short name, or something in brackets. */
const ATOM = String.raw`(?:[A-Za-z]+|\d+(?:[.,]\d+)?|\([^()\s]+\))`;

const unwrap = (s: string) => (s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s);
const greek = (s: string) => s.replace(new RegExp(String.raw`\b(${GREEK.join('|')})\b`, 'g'), '\\$1');

/** LaTeX for a word that looks like maths, or null when it doesn't. */
export function mathLatex(word: string): string | null {
  if (!word || word.length > 40 || /:\/\/|@|www\.|\.(com|es|org|net)\b/i.test(word)) return null;
  if (!/^[A-Za-z0-9^_()+\-=*/.,]+$/.test(word)) return null;
  if (NOT_FRACTIONS.has(word.toLowerCase())) return null;
  // A date (29/10, 29/10/2026) or a plain number with a slash between big numbers: not maths.
  if (/^\d{1,4}(\/\d{1,4}){2}$/.test(word)) return null;
  let found = false;
  let latex = word;
  // sqrt(x) → \sqrt{x}
  latex = latex.replace(/sqrt\(([^()]+)\)/g, (_m, inner: string) => {
    found = true;
    return `\\sqrt{${inner}}`;
  });
  // a/b → \frac{a}{b} (short sides; two numbers only when both are one digit, as in 1/2)
  latex = latex.replace(new RegExp(`(${ATOM})/(${ATOM})`, 'g'), (m, a: string, b: string) => {
    const bare = (x: string) => unwrap(x);
    if (/^\d+$/.test(a) && /^\d+$/.test(b) && (a.length > 1 || b.length > 1)) return m;
    if (/^[A-Za-z]+$/.test(a) && /^[A-Za-z]+$/.test(b) && (a.length > 3 || b.length > 3)) return m;
    found = true;
    return `\\frac{${bare(a)}}{${bare(b)}}`;
  });
  // x^2, e^(i pi) → x^{2}; x_1 → x_{1} (a subscript only on one letter: not snake_case words)
  latex = latex.replace(new RegExp(`(${ATOM}|\\})\\^(${ATOM})`, 'g'), (_m, base: string, exp: string) => {
    found = true;
    return `${base}^{${unwrap(exp)}}`;
  });
  latex = latex.replace(/(^|[^A-Za-z])([A-Za-z])_([A-Za-z0-9]+)/g, (_m, before: string, base: string, sub: string) => {
    found = true;
    return `${before}${base}_{${sub}}`;
  });
  if (!found) return null;
  latex = greek(latex).replace(/\*/g, ' \\cdot ');
  return latex;
}

/**
 * The word just before the cursor (`text` is the line up to it), if it looks
 * like maths: where it starts and ends in `text`, and its LaTeX. One space
 * typed after it still counts (the suggestion shows once the word is done).
 */
export function mathCandidate(text: string): { start: number; end: number; latex: string } | null {
  const end = text.endsWith(' ') ? text.length - 1 : text.length;
  const before = text.slice(0, end);
  const match = /(\S+)$/.exec(before);
  if (!match) return null;
  // Not inside a $…$ being typed.
  if (match[1].includes('$')) return null;
  // Trailing punctuation of a sentence isn't part of it.
  const word = match[1].replace(/[.,;:]+$/, '');
  const latex = mathLatex(word);
  if (!latex) return null;
  const start = match.index;
  return { start, end: start + word.length, latex };
}

/**
 * `$…$` typed in the text (Pandoc's rule, so money stays text): the first
 * `$` has a non-space after it and isn't doubled, the last a non-space
 * before it. "$5 and $10" stays text; "$x^2$" becomes a formula.
 */
export const DOLLAR_MATH = /(?:^|[^$\\\w])\$([^\s$](?:[^$]*[^\s$])?)\$$/;
