/**
 * color.ts
 * Mixing two #RRGGBB colours: the chart's lighter dark-mode series and the
 * tinted backgrounds of its fill patterns are worked out from the palette,
 * never written as new hex values.
 */

function toChannels(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #RRGGBB color: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `amount` of `a` laid over `b`: 1 gives `a`, 0 gives `b`. */
export function mix(a: string, b: string, amount: number): string {
  const ca = toChannels(a);
  const cb = toChannels(b);
  const channel = (i: number) =>
    Math.round(ca[i] * amount + cb[i] * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`.toUpperCase();
}
