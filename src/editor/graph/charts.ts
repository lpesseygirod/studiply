import { describeChart, renderChart, type ChartSpec as DrawnChart } from '../../lib/charts';
import { readNumber, type ChartSpec } from './data';

/**
 * The graph block's door to the charts module (src/lib/charts, built on
 * branch charts-engine): the only file that knows its API. It turns the
 * block's table into the module's spec (named series of x/y points) and
 * never throws, so a bad cell can't break a document. The module escapes
 * every text it draws, gives the SVG its title and description for screen
 * readers, and leaves out (and notes) values it can't draw.
 */

function toDrawn(spec: ChartSpec): DrawnChart {
  return {
    type: spec.kind,
    title: spec.title.trim(),
    xLabel: spec.xLabel.trim() || undefined,
    yLabel: spec.yLabel.trim() || undefined,
    series: spec.series.map((s) => ({
      name: s.name.trim() || 'Series',
      points: spec.labels.flatMap((label, i) => {
        const y = s.values[i];
        if (y === null || y === undefined) return [];
        // Scatter's X is a number (rows without one were left out by planGraph).
        return [{ x: spec.kind === 'scatter' ? (readNumber(label) ?? 0) : label, y }];
      }),
    })),
  };
}

/**
 * The drawing's numbers with a decimal comma: "18.5" → "18,5", "12,000" →
 * "12.000". The module writes them with a point; only the SVG's text is
 * changed (between > and <), never its coordinates.
 */
export function commaDecimals(markup: string): string {
  const swap = (text: string) =>
    text.replace(/(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g, (_m, int: string, dec: string | undefined) => int.replace(/,/g, '.') + (dec ? `,${dec.slice(1)}` : ''));
  return markup.replace(/>([^<]+)</g, (_m, text: string) => `>${swap(text)}<`);
}

/** About the page's proportions: wide graphs are lower, phone-wide ones no lower than this. */
const height = (width: number) => Math.round(Math.max(220, Math.min(400, width * 0.6)));

/**
 * Narrower than this (a phone), the graph is drawn at this width and scaled
 * down to fit (its SVG has a viewBox): labels like "2019" or "Tipo de
 * interés" then keep their line instead of breaking.
 */
const MIN_DRAW_WIDTH = 420;

/**
 * The graph as SVG for a page `width` px wide. `id` keeps two graphs in one
 * document from sharing the SVG's pattern ids; `comma`: decimals with a comma.
 */
export function graphMarkup(spec: ChartSpec, width: number, id = '', comma = false): string {
  try {
    const w = Math.round(Math.max(MIN_DRAW_WIDTH, width));
    const svg = renderChart(toDrawn(spec), { theme: 'light', width: w, height: height(w), idPrefix: id ? `g-${id}` : undefined });
    return comma ? commaDecimals(svg) : svg;
  } catch {
    return '';
  }
}

/** What a screen reader says for the graph (also in copied HTML). */
export function graphDescription(spec: ChartSpec, comma = false): string {
  try {
    const text = describeChart(toDrawn(spec));
    return comma ? commaDecimals(`>${text}<`).slice(1, -1) : text;
  } catch {
    return 'Graph';
  }
}
