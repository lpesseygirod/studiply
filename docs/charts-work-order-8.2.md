# Work order for the charts session: step 8.2's new chart types

**For:** the charts session (branch `charts-engine`, worktree `../Studiply-charts`), which owns `src/lib/charts/`.
**From:** the Studiply main session, step 8.2 ("Formulas and graphs"), via Lea.
**Date:** 31 Oct 2026.

## What this is
Studiply's summaries now carry function plots, economics model graphs, stacked bars and histograms. The main app converts them into its graph block and asks `src/lib/charts` to draw them. The module draws bar, line, pie and scatter today. This order adds four chart types:

1. `function`: y = f(x) drawn exactly from its expression, with a safe parser and marked points;
2. `model`: four fixed economics templates, with curve shifts;
3. `stackedBar`;
4. `histogram`.

**Rules:**
- All the work stays inside `src/lib/charts/`, with its own tests.
- No new dependency.
- Plain TypeScript, no DOM (the same code runs in the app, the editor's WebView and the PDF).
- The existing four types and their tests stay as they are.

**How the app finds out what the module can draw:** it calls `renderChart`. While a type is unknown, `renderChart` throws "Unknown chart type", and the app shows a text placeholder ("… · drawn in a later update"). So once this is merged, the app draws the new types with no change on its side.

## 1. The types (exactly what the app sends)

```ts
// types.ts
export type DataChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'stackedBar' | 'histogram';
export type ChartType = DataChartType | 'function' | 'model';

/** Data charts: today's spec; `type` also takes 'stackedBar' and 'histogram'. */
export interface ChartSpec {
  type: DataChartType;
  title: string;
  xLabel?: string;
  yLabel?: string;
  series: ChartSeries[]; // { name: string; points: { x: string | number; y: number }[] }[]
}

export type FunctionMark = 'roots' | 'vertex' | 'extrema' | 'yIntercept';

export interface FunctionChartSpec {
  type: 'function';
  /** The takeaway ("The parabola crosses zero at ±2"). */
  title: string;
  /** Default 'x' and 'y'. */
  xLabel?: string;
  yLabel?: string;
  /** y as an expression in x, in the grammar of section 2 ("x^2 - 4", "sin(x)", "1/x"). */
  expression: string;
  /** [from, to], from < to. */
  xRange: [number, number];
  /** The points to mark and label; may be empty. */
  marks: FunctionMark[];
}

export type ModelTemplate = 'supplyDemand' | 'islm' | 'normalCurve' | 'costCurves';

/** The curves each template has; the app sends only these ids (it maps "Demanda", "demand curve"… to 'D'). */
export const MODEL_CURVES: Record<ModelTemplate, string[]> = {
  supplyDemand: ['D', 'S'],
  islm: ['IS', 'LM'],
  normalCurve: ['N'],
  costCurves: ['MC', 'ATC', 'AVC'],
};

export interface ModelShift {
  curve: string; // one of MODEL_CURVES[template]
  direction: 'left' | 'right';
}

export interface ModelChartSpec {
  type: 'model';
  title: string;
  template: ModelTemplate;
  /** At most one per curve; may be empty (the template unshifted). */
  shifts: ModelShift[];
}

export type AnyChartSpec = ChartSpec | FunctionChartSpec | ModelChartSpec;

export interface RenderOptions {
  // … today's theme, width, height, idPrefix, plus:
  /**
   * Numbers with a decimal comma ("1,5"), for Spanish pages. Today the app swaps the
   * digits in the SVG's text itself. That breaks coordinates: "(1.5, 2)" would become
   * "(1,5, 2)". So with this option set, the module writes the numbers with a comma
   * and separates coordinates with "; " ("(1,5; 2)"). Default false.
   */
  decimalComma?: boolean;
}
```

```ts
// index.ts
export function renderChart(spec: AnyChartSpec, options?: RenderOptions): string;
export function describeChart(spec: AnyChartSpec): string;
export type { AnyChartSpec, FunctionChartSpec, FunctionMark, ModelChartSpec, ModelShift, ModelTemplate, DataChartType } from './types';
export { MODEL_CURVES } from './types';
```

**What the app guarantees:**
- `title` is at most 120 characters (a summary's takeaway is a sentence: wrap it on two lines rather than cut it).
- `xRange` is two finite numbers, `from < to` (the app uses [−10, 10] when the summary's range is unusable).
- `marks`, `template` and `shifts[].curve` hold only the values above.
- At most 3 series.

**What the module still has to handle:** garbage of every kind (wrong types, NaN, an expression that doesn't parse). It never throws for a known type, only for an unknown `type`, as today.

## 2. `function`: the expression, parsed safely

**No `eval`, no `Function`, no library.** A small recursive-descent parser builds a tree, and the tree is evaluated for each x.

**Grammar** (the same text the app gives Claude in its prompt):

```
expr    := term (('+' | '-') term)*
term    := unary (('*' | '/') unary)*
unary   := ('-' | '+') unary | power
power   := primary ('^' unary)?          -- right-associative: 2^3^2 = 2^9
primary := number | 'x' | 'pi' | 'e' | name '(' expr ')' | '(' expr ')'
number  := digits ['.' digits] | '.' digits
name    := sin | cos | tan | exp | ln | log | sqrt | abs
```

**Precedence:**
- Maths precedence: `-x^2` is −(x²), not (−x)². (The sheets engine does the opposite, on purpose: spreadsheet rules. Don't reuse it.)
- `2^-1` is 0.5 (`^` takes a unary on its right).

**Names:**
- `log` is base 10, `ln` is natural.
- Angles are in radians.

**Also accepted as aliases:**
- the Unicode minus `−` for `-`;
- `×` and `·` for `*`;
- `π` for `pi`;
- whitespace anywhere.

**Refused:**
- implicit multiplication (`2x`, `2(x+1)`, `x sin(x)`);
- unknown names (`y`, `t`, `alert`, `constructor`, `__proto__`);
- `=`, `,`, `;`, quotes and any other character;
- expressions over 200 characters;
- nesting deeper than 32.

A refused expression draws the chart's frame with the empty state **"Can't draw this function"**, and the description says the same. It never throws.

**Evaluating:**
- Plain IEEE doubles.
- A value that isn't finite (1/0, ln(−1), sqrt(−2), tan near π/2 beyond the range) is a **gap**, never drawn.

### Sampling and drawing
- **400 evenly spaced samples** across `xRange`.
- Between two samples whose y differ by more than 1/20 of the visible y-span, the step is halved, up to 6 times, so steep parts are smooth.
- **Discontinuities break the line.** A segment is drawn only when both ends are finite and the midpoint's value lies between them (with a small tolerance). So `1/x` on [−5, 5] has **no vertical line at 0**, and `tan(x)` breaks at each asymptote.
- **The y-range is robust.**
  - Take the 2nd–98th percentile of the finite samples.
  - Widen it to include 0 when 0 is within 3× the span, and to include every marked point.
  - Pad it by 8%.
  - The curve is clipped to the plot area (a clipPath), so a pole doesn't flatten the rest.
- **Axes:**
  - The x axis goes through y = 0 when 0 is in range, else along the bottom. The y axis goes through x = 0 when 0 is in range, else on the left.
  - Ticks at nice numbers, with the existing tick font and grid.
- **One curve,** in the first series colour, solid, 2.5 px.
- **The label** `y = <expression as written>` sits on the curve near its right end, as today's line labels are (no legend).

### Marked points
Each marked point is a dot with its coordinates next to it: "(2, 0)", numbers to 4 significant digits, the minus as "−". At most 8 labelled points; the rest are dots, and the description lists them all.

- **`roots`:**
  - a sign change between two finite samples with no break between them, refined by bisection until the interval is under 1e-9;
  - plus samples that are exactly 0;
  - plus a touching root: an extremum whose |f| < 1e-9 (x² at 0).
- **`extrema`:**
  - a sign change of the slope (finite differences) between samples, refined by golden-section search to 1e-9;
  - each labelled "max" or "min".
- **`vertex`:** the extremum when there is exactly one in range (a parabola). With none or several, nothing is marked, and the description says "no single vertex in this range".
- **`yIntercept`:** (0, f(0)) when 0 is in range and f(0) is finite.

**Description example:** "Function: The parabola crosses zero at ±2. y = x^2 - 4 from −5 to 5. Roots at x = −2 and x = 2. Vertex at (0, −4)."

## 3. `model`: four fixed templates
**Schematic:**
- no numbers on the axes, only the axis names;
- straight lines or simple fixed curves, so it's exact;
- Claude never free-draws.

Each template is drawn in its own unit box [0, 10] × [0, 10], with these exact curves:

| Template | Axes (x / y) | Curves | Marked |
|---|---|---|---|
| `supplyDemand` | Q / P | D: P = 9 − 0.8·Q; S: P = 1 + 0.8·Q (Q from 0.5 to 9.5) | E at (5, 5), with dotted guides to both axes, labelled P₀ and Q₀ |
| `islm` | Y / i | IS: i = 9 − 0.8·Y; LM: i = 1 + 0.8·Y | E at (5, 5), as above (i₀, Y₀) |
| `normalCurve` | x (no y axis) | N: the normal density, μ = 5, σ = 1.4, x from μ − 3.5σ to μ + 3.5σ, scaled to a peak of 8 | ticks and labels μ, μ − σ, μ + σ; the ±1σ band lightly shaded (≈68%) |
| `costCurves` | Q / Cost | MC = Q² − 6Q + 12; AVC = Q²/3 − 3Q + 12; ATC = AVC + 18/Q (Q from 0.5 to 9.5, clipped to the box) | the points where MC crosses AVC (Q = 4.5, AVC's minimum 5.25) and ATC (ATC's minimum, Q ≈ 5.42) |

**Shifts:**
- **What moves:** a shift moves its curve by **1.5 units along the x axis** (left = −1.5, right = +1.5). The normal curve moves by 1σ.
- **How it's drawn:**
  - The shifted curve is drawn **dashed**, in the same colour, labelled with a prime (D′, IS′, MC′, N′).
  - The original stays solid.
  - An arrow runs from the old curve to the new one at mid-height.
- **The new crossing:** E′ is computed (the intersection of the curves as they now are), marked, and given its own dotted guides (P₁, Q₁).
- **Bad shifts:** a shift on an unknown curve id is ignored and noted ("Left out: a shift of a curve this graph doesn't have"). Two shifts on the same curve: the first counts.

**Curve labels:** on the curves, at their right end, no legend (SUMMARY-SPEC).
**Colours:** D/IS/MC in series colour 1; S/LM/ATC in colour 2; AVC in colour 3; N in colour 1.

**Description example:** "Model graph (supply and demand): Rising demand pushes prices up. D shifts right to D′. Equilibrium moves from E (Q₀, P₀) to E′: higher quantity, higher price."
For the description, compare E and E′ in the template's own numbers and say higher, lower or unchanged for each axis.

## 4. `stackedBar` and `histogram`
**`stackedBar`:**
- One bar per category; each series is a segment stacked in series order.
- Patterns and the key above the plot, as bars have today.
- The total is written above each bar.
- A negative value is left out and noted ("Left out: 1 negative value (a stacked bar adds up positive values)").

**`histogram`:**
- One series (with more: the first, plus today's "+N series not shown" note).
- Each point is a bin: `x` is its label ("0–10"), `y` its count.
- Bars touch (no gap), in one colour, one pattern.
- The y axis starts at 0.

**Descriptions:**
- stackedBar: each category's total and its parts;
- histogram: the bins and the tallest bin.

## 5. Style rules (SUMMARY-SPEC "Graphs and visuals")
- The title is the takeaway, as given (the app sends it; the module never makes one up). With no title, the type's name.
- Labels go on the curves and lines, not in a legend. Bars keep their key.
- At most 3 series from the app (the module may still allow 4).
- Black and white must work: lines differ by solid / dashed / dotted and markers; bars by pattern; shifted curves are dashed.
- Every SVG has its `<title>` and `<desc>` (`describeChart`'s text) and `role="img"`, as today.
- The app's document pages are always light (`theme: 'light'`). Dark must work too, as for the existing types.
- Every text is escaped, as today.

## 6. Exactness tests (Jest, inside `src/lib/charts/__tests__`)

**The parser and the function:**
1. **`x^2 - 4`:**
   - f at 50 sample points equals x·x − 4 to 1e-12;
   - roots at −2 and 2 to 1e-9;
   - vertex at (0, −4) to 1e-9;
   - y-intercept (0, −4).
2. **`sin(x)` on [0, 2π]:** roots at 0, π and 2π to 1e-9; extrema at π/2 (max 1) and 3π/2 (min −1).
3. **`1/x` on [−5, 5]:** no drawn segment has one end at x < 0 and the other at x > 0; the SVG path has at least 2 subpaths (`M` twice).
4. **`tan(x)` on [−3, 3]:** the line breaks near ±π/2.
5. **`-x^2`** equals −(x²) at x = 3 (−9, not 9); `2^3^2` = 512; `2^-1` = 0.5; `-2^2` = −4.
6. **Refused, each drawing the empty state and never throwing:**
   - `2x`;
   - `y + 1`;
   - `alert(1)`;
   - `constructor`;
   - `__proto__`;
   - `x =`;
   - `sin x`;
   - a 201-character expression;
   - 40 nested parentheses.
7. **No `eval` or `Function`:** the parser's source contains neither.
8. **Gaps:** `ln(x)` on [−2, 2] draws only x > 0; `sqrt(x - 1)` only x ≥ 1.
9. **The y-range:** `x^2 - 4` includes −4 and the roots; `1/x`'s range isn't blown up by the pole (the 2nd–98th percentile rule).

**Templates:**
10. **supplyDemand:** D and S cross at (5, 5).
    - D right: E′ has a higher Q and a higher P.
    - S right: higher Q, lower P.
    - D left: lower Q, lower P.
11. **islm:** IS right raises Y and i; LM right raises Y and lowers i.
12. **costCurves:** MC crosses AVC at AVC's minimum (Q = 4.5) and ATC at ATC's minimum, each to 1e-6.
13. **normalCurve:** the peak is at μ; μ ± σ are drawn; N right moves the peak by σ.
14. **Shifts on screen:** the shifted curve is dashed and labelled with a prime; an unknown curve id is ignored and noted.

**Data charts:**
15. **stackedBar:** segments add up to the category total; a negative value is left out and noted.
16. **histogram:** bars touch; a second series is noted.

**All new types:**
17. **Descriptions** for each new type: the roots and vertex, the shift and the direction of E → E′, the totals.
18. **Never throws** for a known type with garbage (`expression: 42`, `xRange: ['a']`, `shifts: null`, `series: undefined`); still throws "Unknown chart type" for `type: 'radar'`.
19. **`decimalComma`:** "(1,5; 2)" for a point at (1.5, 2); the coordinates in the SVG's attributes are unchanged.

## 7. What the app expects back
- **The API:**
  - `renderChart` and `describeChart` accept the 4 new types with exactly the specs above, and return an SVG string and a sentence, as today;
  - the new types are exported from `index.ts`;
  - `MODEL_CURVES` is exported.
- **Unknown types** still throw. The app relies on this until the merge, so it can tell what the module draws.
- **Merge and tests:** the module's own tests pass; `npx tsc --noEmit` is clean; it merges into the app's branch as charts 1–4 did.
- **What the app then does (nothing to do in the module):**
  - Removes its temporary cast (`src/editor/graph/charts.ts`), runs its Jest and the Chrome check, and runs `editor:build`.
  - Stops post-processing commas for function and model charts, and passes `decimalComma` instead.
- **Questions:** to Lea. Anything this order doesn't settle (the exact label placement, tick density) is the charts session's call, within the rules above.
