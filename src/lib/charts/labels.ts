/**
 * labels.ts
 * Direct labels (series names at the end of lines, pie slice names) are
 * placed as near their mark as possible, then pushed apart so none overlap.
 */

export interface LabelBox {
  /** Wanted centre. */
  y: number;
  height: number;
}

/**
 * Centres for `items`, in their order, at least `gap` apart and inside
 * [min, max]. When they can't all fit, the last ones run past `max`.
 */
export function spreadLabels(items: LabelBox[], min: number, max: number, gap = 2): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].y - items[b].y || a - b);
  const tops = items.map((it) => it.y - it.height / 2);

  // Down from the top, then up from the bottom, then down again so the
  // first one never starts above `min`.
  let floor = min;
  for (const i of order) {
    tops[i] = Math.max(tops[i], floor);
    floor = tops[i] + items[i].height + gap;
  }
  let ceiling = max;
  for (const i of [...order].reverse()) {
    tops[i] = Math.min(tops[i], ceiling - items[i].height);
    ceiling = tops[i] - gap;
  }
  floor = min;
  for (const i of order) {
    tops[i] = Math.max(tops[i], floor);
    floor = tops[i] + items[i].height + gap;
  }
  return tops.map((top, i) => top + items[i].height / 2);
}
