import { DocColors } from '../../../constants/colors';
import { cleanHex, hexToHsv, hsvToHex, PALETTE, shadesOf } from '../palette';

describe('the colour grid', () => {
  it('has the 10 base colours, each with 5 shades: three lighter, two darker', () => {
    expect(PALETTE).toHaveLength(10);
    expect(PALETTE.every((c) => c.shades.length === 5)).toBe(true);
    const [l80, l60, l40, d25, d50] = shadesOf('#DC2626');
    const sum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(sum(l80)).toBeGreaterThan(sum(l60));
    expect(sum(l60)).toBeGreaterThan(sum(l40));
    expect(sum(l40)).toBeGreaterThan(sum('#DC2626'));
    expect(sum(d25)).toBeLessThan(sum('#DC2626'));
    expect(sum(d50)).toBeLessThan(sum(d25));
    expect(l80).toBe('#F8D4D4');
  });

  it('reads a typed colour, or refuses it', () => {
    expect(cleanHex('1a2')).toBe('#11AA22');
    expect(cleanHex(' #4f43b0 ')).toBe('#4F43B0');
    expect(cleanHex('blue')).toBeNull();
    expect(cleanHex('#12345')).toBeNull();
  });

  it('goes to the spectrum and back without changing the colour', () => {
    for (const { value } of DocColors.palette) expect(hsvToHex(hexToHsv(value))).toBe(value);
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#FF0000');
    expect(hsvToHex({ h: 240, s: 1, v: 0.5 })).toBe('#000080');
  });
});
