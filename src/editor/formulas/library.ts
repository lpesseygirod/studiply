/**
 * The formula library (step 4.7c, Lea): ready-made formulas, grouped, with a
 * search box. Picking one puts in a formula card (schema/formulaCard.ts): the
 * formula drawn by KaTeX and under it one line saying what each letter means.
 * Finance first; another subject is more entries here.
 *
 * Each entry: its name (also the card's title), its group, the LaTeX, the
 * formula in plain text for the list (written as Lea wrote them), the legend
 * as symbol (LaTeX) and meaning, and other words it is found by (Spanish names
 * too: lectures are often in Spanish, the app's words are English).
 * Multi-letter symbols are one word (\mathit{PV}), so KaTeX doesn't space them
 * like P·V.
 */

export type FormulaGroup = 'Time value of money' | 'Valuation' | 'Cost of capital';

export interface FormulaEntry {
  id: string;
  name: string;
  group: FormulaGroup;
  latex: string;
  plain: string;
  legend: { symbol: string; meaning: string }[];
  words: string[];
}

export const FORMULA_GROUPS: FormulaGroup[] = ['Time value of money', 'Valuation', 'Cost of capital'];

const PV = { symbol: '\\mathit{PV}', meaning: 'present value' };
const r = { symbol: 'r', meaning: 'rate per period' };

export const FORMULA_LIBRARY: FormulaEntry[] = [
  {
    id: 'present-value',
    name: 'Present value',
    group: 'Time value of money',
    latex: '\\mathit{PV} = \\frac{\\mathit{FV}}{(1 + r)^{n}}',
    plain: 'PV = FV / (1 + r)^n',
    legend: [PV, { symbol: '\\mathit{FV}', meaning: 'future value' }, r, { symbol: 'n', meaning: 'number of periods' }],
    words: ['PV', 'discount', 'discounting', 'valor actual', 'valor presente', 'actualizar', 'descontar'],
  },
  {
    id: 'future-value',
    name: 'Future value',
    group: 'Time value of money',
    latex: '\\mathit{FV} = \\mathit{PV} \\times (1 + r)^{n}',
    plain: 'FV = PV × (1 + r)^n',
    legend: [{ symbol: '\\mathit{FV}', meaning: 'future value' }, PV, r, { symbol: 'n', meaning: 'number of periods' }],
    words: ['FV', 'compound', 'compounding', 'valor futuro', 'capitalizar', 'capitalización', 'interés compuesto'],
  },
  {
    id: 'annuity',
    name: 'Annuity (present value)',
    group: 'Time value of money',
    latex: '\\mathit{PV} = C \\times \\frac{1 - (1 + r)^{-n}}{r}',
    plain: 'PV = C × [1 − (1 + r)^−n] / r',
    legend: [{ symbol: '\\mathit{PV}', meaning: 'present value of the payments' }, { symbol: 'C', meaning: 'payment per period' }, r, { symbol: 'n', meaning: 'number of payments' }],
    words: ['annuity', 'loan', 'mortgage', 'anualidad', 'renta', 'préstamo', 'hipoteca'],
  },
  {
    id: 'perpetuity',
    name: 'Perpetuity',
    group: 'Time value of money',
    latex: '\\mathit{PV} = \\frac{C}{r}',
    plain: 'PV = C / r',
    legend: [PV, { symbol: 'C', meaning: 'payment per period' }, r],
    words: ['perpetuity', 'perpetuidad', 'renta perpetua'],
  },
  {
    id: 'growing-perpetuity',
    name: 'Growing perpetuity',
    group: 'Time value of money',
    latex: '\\mathit{PV} = \\frac{C}{r - g}',
    plain: 'PV = C / (r − g)',
    legend: [PV, { symbol: 'C', meaning: 'payment next period' }, r, { symbol: 'g', meaning: 'growth rate per period' }],
    words: ['growing perpetuity', 'gordon', 'dividend', 'perpetuidad creciente', 'crecimiento'],
  },
  {
    id: 'effective-annual-rate',
    name: 'Effective annual rate',
    group: 'Time value of money',
    latex: '\\mathit{EAR} = \\left(1 + \\frac{\\mathit{APR}}{m}\\right)^{m} - 1',
    plain: 'EAR = (1 + APR/m)^m − 1',
    legend: [
      { symbol: '\\mathit{EAR}', meaning: 'effective annual rate' },
      { symbol: '\\mathit{APR}', meaning: 'annual percentage rate (nominal)' },
      { symbol: 'm', meaning: 'compounding periods per year' },
    ],
    words: ['EAR', 'APR', 'effective', 'nominal', 'TAE', 'TIN', 'tasa efectiva', 'tipo efectivo', 'tipo nominal'],
  },
  {
    id: 'npv',
    name: 'Net present value (NPV)',
    group: 'Valuation',
    latex: '\\mathit{NPV} = -C_{0} + \\sum_{t=1}^{T} \\frac{C_{t}}{(1 + r)^{t}}',
    plain: 'NPV = −C₀ + Σ Cₜ / (1 + r)^t',
    legend: [
      { symbol: '\\mathit{NPV}', meaning: 'net present value' },
      { symbol: 'C_{0}', meaning: 'initial investment' },
      { symbol: 'C_{t}', meaning: 'cash flow in year t' },
      { symbol: 'r', meaning: 'discount rate' },
      { symbol: 'T', meaning: 'last year' },
    ],
    words: ['NPV', 'VAN', 'VPN', 'valor actual neto', 'cash flow', 'flujo de caja', 'project'],
  },
  {
    id: 'irr',
    name: 'Internal rate of return (IRR)',
    group: 'Valuation',
    latex: '0 = -C_{0} + \\sum_{t=1}^{T} \\frac{C_{t}}{(1 + \\mathit{IRR})^{t}}',
    plain: 'the r that makes NPV = 0',
    legend: [
      { symbol: '\\mathit{IRR}', meaning: 'internal rate of return: the r that makes NPV = 0' },
      { symbol: 'C_{0}', meaning: 'initial investment' },
      { symbol: 'C_{t}', meaning: 'cash flow in year t' },
      { symbol: 'T', meaning: 'last year' },
    ],
    words: ['IRR', 'TIR', 'tasa interna de rentabilidad', 'tasa interna de retorno', 'NPV = 0'],
  },
  {
    id: 'wacc',
    name: 'WACC',
    group: 'Cost of capital',
    latex: '\\mathit{WACC} = \\frac{E}{V} \\times r_{E} + \\frac{D}{V} \\times r_{D} \\times (1 - T)',
    plain: 'WACC = E/V × rₑ + D/V × r_d × (1 − T)',
    legend: [
      { symbol: '\\mathit{WACC}', meaning: 'weighted average cost of capital' },
      { symbol: 'E', meaning: 'market value of equity' },
      { symbol: 'D', meaning: 'market value of debt' },
      { symbol: 'V', meaning: 'firm value, E + D' },
      { symbol: 'r_{E}', meaning: 'cost of equity' },
      { symbol: 'r_{D}', meaning: 'cost of debt' },
      { symbol: 'T', meaning: 'tax rate' },
    ],
    words: ['weighted average cost of capital', 'cost of capital', 'CPPC', 'coste medio ponderado', 'costo promedio ponderado', 'coste de capital'],
  },
  {
    id: 'capm',
    name: 'CAPM',
    group: 'Cost of capital',
    latex: 'r = r_{f} + \\beta \\times (r_{m} - r_{f})',
    plain: 'r = r_f + β × (r_m − r_f)',
    legend: [
      { symbol: 'r', meaning: 'expected return (cost of equity)' },
      { symbol: 'r_{f}', meaning: 'risk-free rate' },
      { symbol: '\\beta', meaning: "beta, the asset's market risk" },
      { symbol: 'r_{m}', meaning: 'expected market return' },
    ],
    words: ['capital asset pricing model', 'beta', 'risk premium', 'cost of equity', 'prima de riesgo', 'coste de los recursos propios', 'rentabilidad esperada'],
  },
];

/** Lower case, without accents: "Préstamo" finds "prestamo". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The entries every word of `query` is found in (name, formula, words, group), in library order. */
export function searchFormulas(query: string): FormulaEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return FORMULA_LIBRARY;
  return FORMULA_LIBRARY.filter((e) => {
    const text = fold([e.name, e.plain, e.group, ...e.words].join(' '));
    return words.every((w) => text.includes(w));
  });
}

export const formulaEntry = (id: string): FormulaEntry | undefined => FORMULA_LIBRARY.find((e) => e.id === id);
