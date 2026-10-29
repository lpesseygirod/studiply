/**
 * scale.ts
 * Axis ticks on round numbers (steps of 1, 2 or 5 × 10ⁿ) and the linear
 * mapping from values to pixels.
 */

export interface Ticks {
  ticks: number[];
  /** Decimals the step needs (0.25 → 2). */
  decimals: number;
  min: number;
  max: number;
}

/** About `target` round ticks covering [min, max]; a flat range is widened first. */
export function niceTicks(min: number, max: number, target = 5): Ticks {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (hi === lo) {
    if (lo === 0) hi = 1;
    else {
      const pad = Math.abs(lo) * 0.1;
      lo -= pad;
      hi += pad;
    }
  }
  const raw = (hi - lo) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const round = (v: number) => {
    const out = Number(v.toFixed(decimals));
    return Object.is(out, -0) ? 0 : out;
  };
  const start = Math.floor(lo / step + 1e-9);
  const end = Math.ceil(hi / step - 1e-9);
  const ticks: number[] = [];
  for (let i = start; i <= end; i++) ticks.push(round(i * step));
  return { ticks, decimals, min: ticks[0], max: ticks[ticks.length - 1] };
}

/** Maps [d0, d1] onto [r0, r1]. */
export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}
