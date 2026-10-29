/**
 * finance.ts
 * PV, FV, PMT, NPER, NPV, IRR and RATE, with Excel's conventions.
 *
 * Money paid out is negative and money received positive, so a 10,000 loan
 * (pv 10000, received) has a negative payment. `rate` is per period: 8 % a
 * year paid monthly is 8%/12. `type` 0 (the default) pays at the end of
 * each period, 1 at the start. All of them rest on one equation:
 *
 *   pv·(1+r)^n + pmt·(1+r·type)·((1+r)^n − 1)/r + fv = 0
 *
 * (with r = 0: pv + pmt·n + fv = 0), solved for whichever is asked. IRR and
 * RATE have no closed form: Newton's method from `guess`, falling back to
 * halving an interval where the sign changes; #NUM! when neither finds a
 * rate.
 */

import { checkNumber, errorFor, isError, type SheetError, type Value } from '../values';
import { asGrid, collectNumbers, numberArg } from './args';
import type { FunctionDef } from './types';

/** Reads number arguments; a missing or left-out one takes its default. */
function readNumbers(args: Value[], defaults: number[]): number[] | SheetError {
  const out: number[] = [];
  for (let i = 0; i < defaults.length; i++) {
    const v = args[i];
    const n = v === undefined || v === null ? defaults[i] : numberArg(v);
    if (isError(n)) return n;
    out.push(n);
  }
  return out;
}

/** ((1+r)^n − 1) / r, accurate for rates near 0 (and n at r = 0). */
function annuityFactor(r: number, n: number): number {
  return r === 0 ? n : Math.expm1(n * Math.log1p(r)) / r;
}

/** The left side of the equation above: 0 when the five values agree. */
function balance(r: number, n: number, payment: number, present: number, future: number, type: number): number {
  return present * (1 + r) ** n + payment * (1 + r * type) * annuityFactor(r, n) + future;
}

export function fv(r: number, n: number, payment: number, present = 0, type = 0): number {
  return -(present * (1 + r) ** n + payment * (1 + r * type) * annuityFactor(r, n));
}

export function pv(r: number, n: number, payment: number, future = 0, type = 0): number {
  return -(future + payment * (1 + r * type) * annuityFactor(r, n)) / (1 + r) ** n;
}

export function pmt(r: number, n: number, present: number, future = 0, type = 0): number {
  return -(present * (1 + r) ** n + future) / ((1 + r * type) * annuityFactor(r, n));
}

export function nper(r: number, payment: number, present: number, future = 0, type = 0): number {
  if (r === 0) return -(present + future) / payment;
  const p = payment * (1 + r * type);
  return Math.log((p - future * r) / (p + present * r)) / Math.log1p(r);
}

export function npv(r: number, values: number[]): number {
  let total = 0;
  values.forEach((v, i) => (total += v / (1 + r) ** (i + 1)));
  return total;
}

/**
 * A rate r > −1 where f(r) = 0, or null. `scale` is the size of the amounts
 * involved, to judge when f(r) is close enough to 0.
 */
export function solveRate(f: (r: number) => number, guess: number, scale: number): number | null {
  const tolerance = 1e-9 * Math.max(1, scale);
  const good = (r: number | null): r is number => r !== null && Number.isFinite(r) && r > -1 && Math.abs(f(r)) <= tolerance;

  let r = guess;
  for (let i = 0; i < 100 && Number.isFinite(r); i++) {
    const h = 1e-7 * Math.max(1, Math.abs(r));
    const slope = (f(r + h) - f(r - h)) / (2 * h);
    if (!Number.isFinite(slope) || slope === 0) break;
    let next = r - f(r) / slope;
    if (next <= -1) next = (r - 1) / 2; // stay above −1, where the formulas mean something
    const done = Math.abs(next - r) < 1e-12 * Math.max(1, Math.abs(r));
    r = next;
    if (done) break;
  }
  if (good(r)) return r;

  // Newton wandered off: look for a sign change, nearest the guess first, and halve it down.
  const points = [-0.999, -0.99, -0.9, -0.75, -0.5, -0.25, -0.1, 0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 100, 1000];
  const brackets: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = f(points[i]);
    const b = f(points[i + 1]);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.sign(a) !== Math.sign(b)) brackets.push([points[i], points[i + 1]]);
  }
  const distance = ([a, b]: [number, number]) => (guess < a ? a - guess : guess > b ? guess - b : 0);
  brackets.sort((x, y) => distance(x) - distance(y));
  for (const [a0, b0] of brackets) {
    let a = a0;
    let b = b0;
    const fa = Math.sign(f(a));
    for (let i = 0; i < 200; i++) {
      const mid = (a + b) / 2;
      if (Math.sign(f(mid)) === fa) a = mid;
      else b = mid;
    }
    const root = (a + b) / 2;
    if (good(root)) return root;
  }
  return null;
}

const noRate = (what: string) => errorFor('#NUM!', `${what} found no rate that fits`);

export const FINANCE_FUNCTIONS: Record<string, FunctionDef> = {
  /** PV(rate, nper, pmt, [fv], [type]) */
  PV: {
    min: 3,
    max: 5,
    fn: (args) => {
      const a = readNumbers(args, [0, 0, 0, 0, 0]);
      if (isError(a)) return a;
      const [r, n, p, f, t] = a;
      return checkNumber(pv(r, n, p, f, t !== 0 ? 1 : 0));
    },
  },

  /** FV(rate, nper, pmt, [pv], [type]) */
  FV: {
    min: 3,
    max: 5,
    fn: (args) => {
      const a = readNumbers(args, [0, 0, 0, 0, 0]);
      if (isError(a)) return a;
      const [r, n, p, v, t] = a;
      return checkNumber(fv(r, n, p, v, t !== 0 ? 1 : 0));
    },
  },

  /** PMT(rate, nper, pv, [fv], [type]) */
  PMT: {
    min: 3,
    max: 5,
    fn: (args) => {
      const a = readNumbers(args, [0, 0, 0, 0, 0]);
      if (isError(a)) return a;
      const [r, n, v, f, t] = a;
      if (n === 0) return errorFor('#NUM!', 'PMT needs at least one period');
      return checkNumber(pmt(r, n, v, f, t !== 0 ? 1 : 0));
    },
  },

  /** NPER(rate, pmt, pv, [fv], [type]) */
  NPER: {
    min: 3,
    max: 5,
    fn: (args) => {
      const a = readNumbers(args, [0, 0, 0, 0, 0]);
      if (isError(a)) return a;
      const [r, p, v, f, t] = a;
      if (r === 0 && p === 0) return errorFor('#NUM!', 'With no rate and no payment the balance never changes');
      return checkNumber(nper(r, p, v, f, t !== 0 ? 1 : 0));
    },
  },

  /** NPV(rate, value1, …): values at the end of periods 1, 2, … (only numbers from cells). */
  NPV: {
    min: 2,
    max: 255,
    fn: (args) => {
      const r = numberArg(args[0]);
      if (isError(r)) return r;
      if (r === -1) return errorFor('#DIV/0!');
      const values = collectNumbers(args.slice(1));
      if (isError(values)) return values;
      return checkNumber(npv(r, values));
    },
  },

  /** IRR(values, [guess]): the rate at which the cash flows' NPV (the first one now) is 0. */
  IRR: {
    min: 1,
    max: 2,
    fn: (args) => {
      const values = collectNumbers([asGrid(args[0])]);
      if (isError(values)) return values;
      const guess = readNumbers(args.slice(1), [0.1]);
      if (isError(guess)) return guess;
      if (!values.some((v) => v > 0) || !values.some((v) => v < 0)) {
        return errorFor('#NUM!', 'IRR needs at least one payment and one receipt');
      }
      const f = (r: number) => values.reduce((total, v, i) => total + v / (1 + r) ** i, 0);
      const scale = values.reduce((total, v) => total + Math.abs(v), 0);
      return solveRate(f, guess[0], scale) ?? noRate('IRR');
    },
  },

  /** RATE(nper, pmt, pv, [fv], [type], [guess]) */
  RATE: {
    min: 3,
    max: 6,
    fn: (args) => {
      const a = readNumbers(args, [0, 0, 0, 0, 0, 0.1]);
      if (isError(a)) return a;
      const [n, p, v, f, t, guess] = a;
      if (n <= 0) return errorFor('#NUM!', 'RATE needs at least one period');
      const type = t !== 0 ? 1 : 0;
      const scale = Math.abs(v) + Math.abs(p) * n + Math.abs(f);
      return solveRate((r) => balance(r, n, p, v, f, type), guess, scale) ?? noRate('RATE');
    },
  },
};
