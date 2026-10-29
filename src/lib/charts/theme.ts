/**
 * theme.ts
 * The chart's colours and type in light and dark mode, from the app's
 * palette (colors.ts) and scale (typography.ts).
 *
 * Series colours are the document palette's blue, orange, teal and purple,
 * in that fixed order: the only four app colours that pass the colour-blind
 * checks as a set (the theme's text colours don't). In dark mode they are
 * lifted toward the light ink by the smallest equal step that gives each
 * 3:1 on the dark card. Text, axes and grid use the theme's text tokens.
 */

import { DarkColors, DocColors, LightColors, type ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { contrast } from '../../theme/contrast';
import { mix } from './color';
import type { ChartMode } from './types';

/** Series drawn per chart; more get a "+N series not shown" note. */
export const MAX_SERIES = 4;

const SERIES_KEYS = ['blue', 'orange', 'teal', 'purple'] as const;

/** Marks need 3:1 against the background (docs/DESIGN.md Accessibility basics). */
export const MARK_CONTRAST = 3;

export interface ChartTheme {
  mode: ChartMode;
  background: string;
  text: string;
  textMuted: string;
  grid: string;
  axis: string;
  /** One colour per series, in order. */
  series: string[];
  /** Each series colour faded into the background: behind fill patterns. */
  tints: string[];
}

export const ChartFont = {
  family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  title: Typography.size.md,
  label: Typography.size.sm,
  tick: Typography.size.xs,
  titleWeight: Typography.weight.semibold,
  labelWeight: Typography.weight.medium,
  leading: Typography.leading.tight,
} as const;

function paletteColor(key: string): string {
  const found = DocColors.palette.find((c) => c.key === key);
  if (!found) throw new Error(`No ${key} in DocColors.palette`);
  return found.value;
}

const BASE_SERIES = SERIES_KEYS.map(paletteColor);

/** The smallest equal step toward `ink` that gives every colour 3:1 on `bg`. */
function lifted(colors: string[], ink: string, bg: string): string[] {
  for (let step = 0; step <= 20; step++) {
    const out = colors.map((c) => mix(ink, c, step / 20));
    if (out.every((c) => contrast(c, bg) >= MARK_CONTRAST)) return out;
  }
  return colors.map(() => ink);
}

function build(mode: ChartMode, c: ThemeColors): ChartTheme {
  const series = mode === 'dark' ? lifted(BASE_SERIES, c.text.primary, c.card) : BASE_SERIES;
  return {
    mode,
    background: c.card,
    text: c.text.primary,
    textMuted: c.text.secondary,
    grid: c.border,
    axis: c.text.secondary,
    series,
    tints: series.map((s) => mix(s, c.card, 0.2)),
  };
}

const THEMES: Record<ChartMode, ChartTheme> = {
  light: build('light', LightColors),
  dark: build('dark', DarkColors),
};

export function chartTheme(mode: ChartMode = 'light'): ChartTheme {
  return THEMES[mode] ?? THEMES.light;
}
