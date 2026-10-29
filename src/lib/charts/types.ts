/**
 * types.ts
 * What a chart is drawn from: the `dataChart` shape of SUMMARY-SPEC (type,
 * title, axis labels, named series of x/y points), so the graph block (step
 * 4.7d) and the summary's charts (step 8.2) share one drawing.
 */

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter';

export interface ChartPoint {
  /** A category ("2019", "Brand A") or a number (scatter, numeric line charts). */
  x: string | number;
  y: number;
}

export interface ChartSeries {
  name: string;
  points: ChartPoint[];
}

export interface ChartSpec {
  type: ChartType;
  /** States the takeaway ("Investment falls as rates rise"). */
  title: string;
  xLabel?: string;
  yLabel?: string;
  /** Bar, line and scatter draw up to 4 series; a pie draws the first. */
  series: ChartSeries[];
}

export type ChartMode = 'light' | 'dark';

export interface RenderOptions {
  /** The app's appearance; document pages use 'light'. Default 'light'. */
  theme?: ChartMode;
  /** Size in px (the SVG also has a viewBox, so it scales). Default 640 × 400. */
  width?: number;
  height?: number;
  /** Prefix for the SVG's ids (patterns, title). Default: a hash of the chart. */
  idPrefix?: string;
}
