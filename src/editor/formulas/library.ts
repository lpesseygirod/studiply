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

export type FormulaGroup = 'Time value of money' | 'Valuation' | 'Cost of capital' | 'Statistics' | 'Macroeconomics' | 'Calculus';

export interface FormulaEntry {
  id: string;
  name: string;
  group: FormulaGroup;
  latex: string;
  plain: string;
  legend: { symbol: string; meaning: string }[];
  words: string[];
}

export const FORMULA_GROUPS: FormulaGroup[] = ['Time value of money', 'Valuation', 'Cost of capital', 'Statistics', 'Macroeconomics', 'Calculus'];

const PV = { symbol: '\\mathit{PV}', meaning: 'present value' };
const r = { symbol: 'r', meaning: 'rate per period' };

const xBar = { symbol: '\\bar{x}', meaning: 'sample mean' };
const xi = { symbol: 'x_{i}', meaning: 'the i-th value' };
const nSample = { symbol: 'n', meaning: 'sample size' };
const sSample = { symbol: 's', meaning: 'sample standard deviation' };
const fPrime = { symbol: "f'", meaning: 'derivative of f' };
const gPrime = { symbol: "g'", meaning: 'derivative of g' };

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
  {
    id: 'mean',
    name: 'Mean',
    group: 'Statistics',
    latex: '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_{i}',
    plain: 'x̄ = Σxᵢ / n',
    legend: [xBar, xi, { symbol: 'n', meaning: 'number of values' }],
    words: ['average', 'arithmetic mean', 'media', 'media aritmética', 'media muestral', 'promedio'],
  },
  {
    id: 'expected-value',
    name: 'Expected value',
    group: 'Statistics',
    latex: 'E[X] = \\sum_{x} x \\, P(X = x)',
    plain: 'E[X] = Σ x × P(X = x)',
    legend: [
      { symbol: 'E[X]', meaning: 'expected value of X' },
      { symbol: 'x', meaning: 'a value X can take' },
      { symbol: 'P(X = x)', meaning: 'probability of that value' },
    ],
    words: ['expectation', 'mean', 'random variable', 'esperanza', 'esperanza matemática', 'valor esperado', 'variable aleatoria'],
  },
  {
    id: 'sample-variance',
    name: 'Sample variance',
    group: 'Statistics',
    latex: 's^{2} = \\frac{1}{n - 1} \\sum_{i=1}^{n} (x_{i} - \\bar{x})^{2}',
    plain: 's² = Σ(xᵢ − x̄)² / (n − 1)',
    legend: [{ symbol: 's^{2}', meaning: 'sample variance' }, xi, xBar, nSample],
    words: ['variance', 'dispersion', 'spread', 'varianza', 'varianza muestral', 'cuasivarianza', 'dispersión'],
  },
  {
    id: 'standard-deviation',
    name: 'Standard deviation',
    group: 'Statistics',
    latex: 's = \\sqrt{\\frac{1}{n - 1} \\sum_{i=1}^{n} (x_{i} - \\bar{x})^{2}}',
    plain: 's = √[Σ(xᵢ − x̄)² / (n − 1)]',
    legend: [sSample, xi, xBar, nSample],
    words: ['SD', 'dispersion', 'spread', 'desviación típica', 'desviación estándar', 'dispersión'],
  },
  {
    id: 'z-score',
    name: 'Z-score',
    group: 'Statistics',
    latex: 'z = \\frac{x - \\mu}{\\sigma}',
    plain: 'z = (x − μ) / σ',
    legend: [
      { symbol: 'z', meaning: 'standard deviations from the mean' },
      { symbol: 'x', meaning: 'the value' },
      { symbol: '\\mu', meaning: 'population mean' },
      { symbol: '\\sigma', meaning: 'population standard deviation' },
    ],
    words: ['standard score', 'standardize', 'normal distribution', 'puntuación z', 'tipificar', 'tipificación', 'estandarizar', 'distribución normal'],
  },
  {
    id: 'standard-error',
    name: 'Standard error of the mean',
    group: 'Statistics',
    latex: '\\mathit{SE} = \\frac{s}{\\sqrt{n}}',
    plain: 'SE = s / √n',
    legend: [{ symbol: '\\mathit{SE}', meaning: 'standard error of the mean' }, sSample, nSample],
    words: ['SE', 'SEM', 'error estándar', 'error típico', 'error típico de la media'],
  },
  {
    id: 'confidence-interval',
    name: 'Confidence interval for the mean',
    group: 'Statistics',
    latex: '\\bar{x} \\pm z_{\\alpha/2} \\times \\frac{s}{\\sqrt{n}}',
    plain: 'x̄ ± z_{α/2} × s / √n',
    legend: [xBar, { symbol: 'z_{\\alpha/2}', meaning: 'critical value (1.96 for 95%)' }, sSample, nSample],
    words: ['CI', 'margin of error', 'confidence level', 'intervalo de confianza', 'margen de error', 'nivel de confianza'],
  },
  {
    id: 't-statistic',
    name: 'One-sample t statistic',
    group: 'Statistics',
    latex: 't = \\frac{\\bar{x} - \\mu_{0}}{s / \\sqrt{n}}',
    plain: 't = (x̄ − μ₀) / (s / √n)',
    legend: [
      { symbol: 't', meaning: 't statistic, with n − 1 degrees of freedom' },
      xBar,
      { symbol: '\\mu_{0}', meaning: 'mean under the null hypothesis' },
      sSample,
      nSample,
    ],
    words: ['t-test', 'hypothesis test', 'null hypothesis', 'student', 'contraste de hipótesis', 'prueba t', 'hipótesis nula', 't de Student'],
  },
  {
    id: 'covariance',
    name: 'Covariance',
    group: 'Statistics',
    latex: '\\operatorname{cov}(X, Y) = \\frac{1}{n - 1} \\sum_{i=1}^{n} (x_{i} - \\bar{x})(y_{i} - \\bar{y})',
    plain: 'cov(X, Y) = Σ(xᵢ − x̄)(yᵢ − ȳ) / (n − 1)',
    legend: [
      { symbol: '\\operatorname{cov}(X, Y)', meaning: 'sample covariance of X and Y' },
      { symbol: 'x_{i}', meaning: 'i-th value of X' },
      { symbol: 'y_{i}', meaning: 'i-th value of Y' },
      { symbol: '\\bar{x}', meaning: 'mean of X' },
      { symbol: '\\bar{y}', meaning: 'mean of Y' },
      { symbol: 'n', meaning: 'number of pairs' },
    ],
    words: ['covariance', 'covarianza', 'relación lineal'],
  },
  {
    id: 'correlation',
    name: 'Correlation coefficient (Pearson)',
    group: 'Statistics',
    latex: 'r = \\frac{\\operatorname{cov}(X, Y)}{s_{x} \\, s_{y}}',
    plain: 'r = cov(X, Y) / (sₓ × s_y)',
    legend: [
      { symbol: 'r', meaning: 'correlation coefficient, from −1 to 1' },
      { symbol: '\\operatorname{cov}(X, Y)', meaning: 'covariance of X and Y' },
      { symbol: 's_{x}', meaning: 'standard deviation of X' },
      { symbol: 's_{y}', meaning: 'standard deviation of Y' },
    ],
    words: ['correlation', 'coeficiente de correlación', 'correlación', 'correlación lineal'],
  },
  {
    id: 'ols-regression',
    name: 'Regression slope and intercept (OLS)',
    group: 'Statistics',
    latex: 'b_{1} = \\frac{\\sum_{i=1}^{n} (x_{i} - \\bar{x})(y_{i} - \\bar{y})}{\\sum_{i=1}^{n} (x_{i} - \\bar{x})^{2}}, \\quad b_{0} = \\bar{y} - b_{1} \\bar{x}',
    plain: 'b₁ = Σ(xᵢ − x̄)(yᵢ − ȳ) / Σ(xᵢ − x̄)², b₀ = ȳ − b₁x̄',
    legend: [
      { symbol: 'b_{1}', meaning: 'slope of the line ŷ = b₀ + b₁x' },
      { symbol: 'b_{0}', meaning: 'intercept' },
      { symbol: 'x_{i}', meaning: 'explanatory variable' },
      { symbol: 'y_{i}', meaning: 'dependent variable' },
      { symbol: '\\bar{x}', meaning: 'mean of x' },
      { symbol: '\\bar{y}', meaning: 'mean of y' },
    ],
    words: ['least squares', 'linear regression', 'slope', 'intercept', 'MCO', 'mínimos cuadrados', 'regresión lineal', 'pendiente', 'ordenada en el origen', 'intercepto'],
  },
  {
    id: 'bayes',
    name: "Bayes' theorem",
    group: 'Statistics',
    latex: 'P(A \\mid B) = \\frac{P(B \\mid A) \\, P(A)}{P(B)}',
    plain: 'P(A|B) = P(B|A) × P(A) / P(B)',
    legend: [
      { symbol: 'P(A \\mid B)', meaning: 'probability of A given B' },
      { symbol: 'P(B \\mid A)', meaning: 'probability of B given A' },
      { symbol: 'P(A)', meaning: 'prior probability of A' },
      { symbol: 'P(B)', meaning: 'total probability of B' },
    ],
    words: ['conditional probability', 'posterior', 'prior', 'teorema de Bayes', 'probabilidad condicionada', 'probabilidad condicional', 'probabilidad a posteriori'],
  },
  {
    id: 'binomial',
    name: 'Binomial probability',
    group: 'Statistics',
    latex: 'P(X = k) = \\binom{n}{k} p^{k} (1 - p)^{n - k}',
    plain: 'P(X = k) = C(n, k) × pᵏ × (1 − p)ⁿ⁻ᵏ',
    legend: [
      { symbol: 'P(X = k)', meaning: 'probability of exactly k successes' },
      { symbol: '\\binom{n}{k}', meaning: 'ways to choose k of n' },
      { symbol: 'p', meaning: 'probability of success in one trial' },
      { symbol: 'n', meaning: 'number of trials' },
    ],
    words: ['binomial distribution', 'trials', 'successes', 'distribución binomial', 'ensayos', 'éxitos', 'combinatoria'],
  },
  {
    id: 'gdp',
    name: 'GDP (expenditure approach)',
    group: 'Macroeconomics',
    latex: 'Y = C + I + G + (X - M)',
    plain: 'Y = C + I + G + (X − M)',
    legend: [
      { symbol: 'Y', meaning: 'GDP (output)' },
      { symbol: 'C', meaning: 'consumption' },
      { symbol: 'I', meaning: 'investment' },
      { symbol: 'G', meaning: 'government spending' },
      { symbol: 'X', meaning: 'exports' },
      { symbol: 'M', meaning: 'imports' },
    ],
    words: ['gross domestic product', 'aggregate demand', 'expenditure', 'net exports', 'PIB', 'producto interior bruto', 'producto interno bruto', 'demanda agregada', 'gasto', 'exportaciones netas'],
  },
  {
    id: 'gdp-deflator',
    name: 'GDP deflator',
    group: 'Macroeconomics',
    latex: '\\text{Deflator} = \\frac{\\text{nominal GDP}}{\\text{real GDP}} \\times 100',
    plain: 'Deflator = nominal GDP / real GDP × 100',
    legend: [
      { symbol: '\\text{Deflator}', meaning: 'price level of everything produced (base year = 100)' },
      { symbol: '\\text{nominal GDP}', meaning: 'GDP at current prices' },
      { symbol: '\\text{real GDP}', meaning: 'GDP at base-year prices' },
    ],
    words: ['price level', 'deflactor', 'deflactor del PIB', 'PIB nominal', 'PIB real', 'nivel de precios'],
  },
  {
    id: 'inflation-rate',
    name: 'Inflation rate',
    group: 'Macroeconomics',
    latex: '\\pi = \\frac{P_{t} - P_{t-1}}{P_{t-1}} \\times 100',
    plain: 'π = (Pₜ − Pₜ₋₁) / Pₜ₋₁ × 100',
    legend: [
      { symbol: '\\pi', meaning: 'inflation rate (%)' },
      { symbol: 'P_{t}', meaning: 'price level (e.g. CPI) this year' },
      { symbol: 'P_{t-1}', meaning: 'price level last year' },
    ],
    words: ['inflation', 'CPI', 'price index', 'inflación', 'tasa de inflación', 'IPC', 'índice de precios'],
  },
  {
    id: 'gdp-growth',
    name: 'Real GDP growth rate',
    group: 'Macroeconomics',
    latex: 'g = \\frac{Y_{t} - Y_{t-1}}{Y_{t-1}} \\times 100',
    plain: 'g = (Yₜ − Yₜ₋₁) / Yₜ₋₁ × 100',
    legend: [
      { symbol: 'g', meaning: 'growth rate (%)' },
      { symbol: 'Y_{t}', meaning: 'real GDP this year' },
      { symbol: 'Y_{t-1}', meaning: 'real GDP last year' },
    ],
    words: ['economic growth', 'crecimiento', 'crecimiento económico', 'tasa de crecimiento', 'PIB'],
  },
  {
    id: 'unemployment-rate',
    name: 'Unemployment rate',
    group: 'Macroeconomics',
    latex: 'u = \\frac{U}{L} \\times 100',
    plain: 'u = U / L × 100',
    legend: [
      { symbol: 'u', meaning: 'unemployment rate (%)' },
      { symbol: 'U', meaning: 'number of unemployed' },
      { symbol: 'L', meaning: 'labour force (employed + unemployed)' },
    ],
    words: ['labour force', 'labor force', 'jobless', 'tasa de paro', 'tasa de desempleo', 'desempleo', 'paro', 'población activa'],
  },
  {
    id: 'fisher',
    name: 'Real interest rate (Fisher equation)',
    group: 'Macroeconomics',
    latex: 'r \\approx i - \\pi',
    plain: 'r ≈ i − π',
    legend: [
      { symbol: 'r', meaning: 'real interest rate' },
      { symbol: 'i', meaning: 'nominal interest rate' },
      { symbol: '\\pi', meaning: 'inflation rate' },
    ],
    words: ['nominal interest rate', 'inflation', 'ecuación de Fisher', 'tipo de interés real', 'tasa de interés real', 'tipo de interés nominal', 'tasa de interés nominal'],
  },
  {
    id: 'quantity-theory',
    name: 'Quantity theory of money',
    group: 'Macroeconomics',
    latex: 'M \\times V = P \\times Y',
    plain: 'M × V = P × Y',
    legend: [
      { symbol: 'M', meaning: 'money supply' },
      { symbol: 'V', meaning: 'velocity of money' },
      { symbol: 'P', meaning: 'price level' },
      { symbol: 'Y', meaning: 'real output' },
    ],
    words: ['velocity', 'money supply', 'MV = PY', 'teoría cuantitativa del dinero', 'velocidad del dinero', 'oferta monetaria', 'masa monetaria'],
  },
  {
    id: 'money-multiplier',
    name: 'Money multiplier',
    group: 'Macroeconomics',
    latex: 'm = \\frac{1}{\\mathit{rr}}',
    plain: 'm = 1 / rr',
    legend: [
      { symbol: 'm', meaning: 'money multiplier' },
      { symbol: '\\mathit{rr}', meaning: 'reserve requirement ratio' },
    ],
    words: ['reserve ratio', 'reserve requirement', 'banks', 'multiplicador monetario', 'multiplicador del dinero', 'coeficiente de caja', 'encaje legal', 'reservas'],
  },
  {
    id: 'keynesian-multiplier',
    name: 'Keynesian spending multiplier',
    group: 'Macroeconomics',
    latex: 'k = \\frac{1}{1 - \\mathit{MPC}}',
    plain: 'k = 1 / (1 − MPC)',
    legend: [
      { symbol: 'k', meaning: 'change in output per 1 of extra spending' },
      { symbol: '\\mathit{MPC}', meaning: 'marginal propensity to consume' },
    ],
    words: ['marginal propensity to consume', 'fiscal policy', 'multiplicador keynesiano', 'multiplicador del gasto', 'propensión marginal a consumir', 'PMgC', 'PMC', 'política fiscal'],
  },
  {
    id: 'consumption-function',
    name: 'Consumption function',
    group: 'Macroeconomics',
    latex: 'C = C_{0} + c \\times (Y - T)',
    plain: 'C = C₀ + c × (Y − T)',
    legend: [
      { symbol: 'C', meaning: 'consumption' },
      { symbol: 'C_{0}', meaning: 'autonomous consumption' },
      { symbol: 'c', meaning: 'marginal propensity to consume' },
      { symbol: 'Y', meaning: 'income' },
      { symbol: 'T', meaning: 'taxes' },
    ],
    words: ['autonomous consumption', 'disposable income', 'MPC', 'keynesian', 'función de consumo', 'consumo autónomo', 'renta disponible', 'ingreso disponible', 'propensión marginal a consumir'],
  },
  {
    id: 'okun',
    name: "Okun's law",
    group: 'Macroeconomics',
    latex: '\\frac{Y - Y^{*}}{Y^{*}} = -\\beta \\times (u - u_{n})',
    plain: '(Y − Y*) / Y* = −β × (u − uₙ)',
    legend: [
      { symbol: 'Y', meaning: 'real GDP' },
      { symbol: 'Y^{*}', meaning: 'potential GDP' },
      { symbol: '\\beta', meaning: "Okun's coefficient (about 2)" },
      { symbol: 'u', meaning: 'unemployment rate' },
      { symbol: 'u_{n}', meaning: 'natural rate of unemployment' },
    ],
    words: ['output gap', 'unemployment', 'ley de Okun', 'brecha de producción', 'PIB potencial', 'desempleo', 'paro'],
  },
  {
    id: 'phillips-curve',
    name: 'Phillips curve (expectations-augmented)',
    group: 'Macroeconomics',
    latex: '\\pi = \\pi^{e} - \\beta \\times (u - u_{n})',
    plain: 'π = πᵉ − β × (u − uₙ)',
    legend: [
      { symbol: '\\pi', meaning: 'inflation' },
      { symbol: '\\pi^{e}', meaning: 'expected inflation' },
      { symbol: '\\beta', meaning: 'how strongly inflation reacts to unemployment' },
      { symbol: 'u', meaning: 'unemployment rate' },
      { symbol: 'u_{n}', meaning: 'natural rate of unemployment (NAIRU)' },
    ],
    words: ['NAIRU', 'expected inflation', 'inflation', 'unemployment', 'curva de Phillips', 'inflación esperada', 'inflación', 'desempleo', 'paro'],
  },
  {
    id: 'taylor-rule',
    name: 'Taylor rule',
    group: 'Macroeconomics',
    latex: 'i = r^{*} + \\pi + 0.5 \\times (\\pi - \\pi^{*}) + 0.5 \\times (y - y^{*})',
    plain: 'i = r* + π + 0.5 × (π − π*) + 0.5 × (y − y*)',
    legend: [
      { symbol: 'i', meaning: 'central bank policy rate' },
      { symbol: 'r^{*}', meaning: 'neutral real interest rate' },
      { symbol: '\\pi', meaning: 'inflation' },
      { symbol: '\\pi^{*}', meaning: 'inflation target' },
      { symbol: 'y - y^{*}', meaning: 'output gap, in % of potential GDP' },
    ],
    words: ['central bank', 'monetary policy', 'policy rate', 'regla de Taylor', 'banco central', 'política monetaria', 'tipo de interés oficial', 'tasa de política monetaria'],
  },
  {
    id: 'cobb-douglas',
    name: 'Cobb–Douglas production function',
    group: 'Macroeconomics',
    latex: 'Y = A \\, K^{\\alpha} L^{1 - \\alpha}',
    plain: 'Y = A × K^α × L^(1−α)',
    legend: [
      { symbol: 'Y', meaning: 'output' },
      { symbol: 'A', meaning: 'total factor productivity' },
      { symbol: 'K', meaning: 'capital' },
      { symbol: 'L', meaning: 'labour' },
      { symbol: '\\alpha', meaning: "capital's share of income" },
    ],
    words: ['cobb-douglas', 'cobb douglas', 'TFP', 'solow', 'función de producción', 'productividad total de los factores', 'PTF'],
  },
  {
    id: 'derivative',
    name: 'Derivative (definition)',
    group: 'Calculus',
    latex: "f'(x) = \\lim_{h \\to 0} \\frac{f(x + h) - f(x)}{h}",
    plain: 'f′(x) = lim h→0 [f(x + h) − f(x)] / h',
    legend: [
      { symbol: "f'(x)", meaning: 'derivative of f at x (slope of the tangent)' },
      { symbol: 'f(x)', meaning: 'the function' },
      { symbol: 'h', meaning: 'a small step in x' },
    ],
    words: ['limit', 'difference quotient', 'slope', 'tangent', 'derivada', 'límite', 'cociente incremental', 'pendiente', 'tangente', 'recta tangente'],
  },
  {
    id: 'power-rule',
    name: 'Power rule',
    group: 'Calculus',
    latex: '\\frac{d}{dx} x^{n} = n \\, x^{n-1}',
    plain: 'd/dx xⁿ = n × xⁿ⁻¹',
    legend: [
      { symbol: '\\frac{d}{dx}', meaning: 'derivative with respect to x' },
      { symbol: 'n', meaning: 'any real exponent' },
    ],
    words: ['derivative', 'exponent', 'regla de la potencia', 'derivada', 'potencia', 'exponente'],
  },
  {
    id: 'product-rule',
    name: 'Product rule',
    group: 'Calculus',
    latex: "(f g)' = f' g + f g'",
    plain: '(f·g)′ = f′·g + f·g′',
    legend: [{ symbol: 'f', meaning: 'a function of x' }, { symbol: 'g', meaning: 'another function of x' }, fPrime, gPrime],
    words: ['derivative', 'regla del producto', 'derivada de un producto', 'derivada'],
  },
  {
    id: 'quotient-rule',
    name: 'Quotient rule',
    group: 'Calculus',
    latex: "\\left(\\frac{f}{g}\\right)' = \\frac{f' g - f g'}{g^{2}}",
    plain: '(f/g)′ = (f′·g − f·g′) / g²',
    legend: [{ symbol: 'f', meaning: 'numerator' }, { symbol: 'g', meaning: 'denominator (not 0)' }, fPrime, gPrime],
    words: ['derivative', 'fraction', 'regla del cociente', 'derivada de un cociente', 'derivada'],
  },
  {
    id: 'chain-rule',
    name: 'Chain rule',
    group: 'Calculus',
    latex: "\\frac{d}{dx} f(g(x)) = f'(g(x)) \\, g'(x)",
    plain: 'd/dx f(g(x)) = f′(g(x)) × g′(x)',
    legend: [{ symbol: 'f', meaning: 'outer function' }, { symbol: 'g', meaning: 'inner function' }, fPrime, gPrime],
    words: ['composite function', 'composition', 'derivative', 'regla de la cadena', 'función compuesta', 'derivada'],
  },
  {
    id: 'exp-ln-derivatives',
    name: 'Derivatives of eˣ and ln x',
    group: 'Calculus',
    latex: '\\frac{d}{dx} e^{x} = e^{x}, \\quad \\frac{d}{dx} \\ln x = \\frac{1}{x}',
    plain: '(eˣ)′ = eˣ, (ln x)′ = 1/x',
    legend: [
      { symbol: 'e', meaning: "Euler's number, about 2.718" },
      { symbol: '\\ln x', meaning: 'natural logarithm of x (x > 0)' },
    ],
    words: ['exponential', 'logarithm', 'natural log', 'exp', 'derivative', 'exponencial', 'logaritmo', 'logaritmo neperiano', 'logaritmo natural', 'derivada'],
  },
  {
    id: 'lhopital',
    name: "L'Hôpital's rule",
    group: 'Calculus',
    latex: "\\lim_{x \\to a} \\frac{f(x)}{g(x)} = \\lim_{x \\to a} \\frac{f'(x)}{g'(x)}",
    plain: 'lim f(x)/g(x) = lim f′(x)/g′(x), when 0/0 or ∞/∞',
    legend: [
      { symbol: 'a', meaning: 'the point, where f and g are both 0 (or both ±∞)' },
      { symbol: "f'(x)", meaning: 'derivative of f' },
      { symbol: "g'(x)", meaning: 'derivative of g' },
    ],
    words: ['lhopital', 'limit', 'indeterminate form', '0/0', "regla de L'Hôpital", "L'Hospital", 'límite', 'indeterminación', 'forma indeterminada'],
  },
  {
    id: 'power-rule-integral',
    name: 'Integral of xⁿ',
    group: 'Calculus',
    latex: '\\int x^{n} \\, dx = \\frac{x^{n+1}}{n + 1} + C, \\quad n \\neq -1',
    plain: '∫xⁿ dx = xⁿ⁺¹ / (n + 1) + C, n ≠ −1',
    legend: [
      { symbol: 'n', meaning: 'any exponent except −1' },
      { symbol: 'C', meaning: 'constant of integration' },
    ],
    words: ['antiderivative', 'indefinite integral', 'power rule', 'integral indefinida', 'primitiva', 'antiderivada', 'integral inmediata'],
  },
  {
    id: 'fundamental-theorem',
    name: 'Fundamental theorem of calculus',
    group: 'Calculus',
    latex: '\\int_{a}^{b} f(x) \\, dx = F(b) - F(a)',
    plain: '∫ₐᵇ f(x) dx = F(b) − F(a)',
    legend: [
      { symbol: 'F', meaning: "an antiderivative of f (F' = f)" },
      { symbol: 'a', meaning: 'lower limit' },
      { symbol: 'b', meaning: 'upper limit' },
    ],
    words: ['definite integral', 'antiderivative', 'area', 'teorema fundamental del cálculo', 'regla de Barrow', 'integral definida', 'primitiva', 'área'],
  },
  {
    id: 'integration-by-parts',
    name: 'Integration by parts',
    group: 'Calculus',
    latex: '\\int u \\, dv = u v - \\int v \\, du',
    plain: '∫u dv = u·v − ∫v du',
    legend: [
      { symbol: 'u', meaning: 'the part you differentiate' },
      { symbol: 'dv', meaning: 'the part you integrate' },
      { symbol: 'v', meaning: 'the integral of dv' },
      { symbol: 'du', meaning: 'the derivative of u, times dx' },
    ],
    words: ['integral', 'integración por partes', 'por partes'],
  },
  {
    id: 'taylor-series',
    name: 'Taylor series',
    group: 'Calculus',
    latex: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x - a)^{n}',
    plain: 'f(x) = Σ f⁽ⁿ⁾(a) / n! × (x − a)ⁿ',
    legend: [
      { symbol: 'f^{(n)}(a)', meaning: 'n-th derivative of f at a' },
      { symbol: 'a', meaning: 'the point the series is centred on' },
      { symbol: 'n!', meaning: 'n factorial' },
    ],
    words: ['maclaurin', 'taylor polynomial', 'approximation', 'serie de Taylor', 'polinomio de Taylor', 'serie de Maclaurin', 'aproximación'],
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
