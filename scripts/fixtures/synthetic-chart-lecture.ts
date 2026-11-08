/**
 * A synthetic lecture with a photographed bar chart (Lea, 6 Nov: graphs in photos redrawn as charts) as a
 * fixture (the format of supabase/functions/_shared/summary-fixture.ts): 10 min of Economía de la
 * empresa in Spanish. At 4:00 the professor points at a bar chart on the board, the company's yearly
 * sales 2019–2023, and talks about its shape but never says its values: they are only in the photo
 * (CHART_EXPECTED), so a chart with them can only have been read off it.
 *
 * The photo (media/chart.jpg) is drawn in Chrome by the web-check folder's chart-photo.mjs, with these
 * values; the evaluation never makes it from the app icon. Visuals 8, the photos ticked. Stable ids.
 * TypeScript (not .mjs) so both Deno (scripts/eval-summaries.ts) and Jest import it.
 */

const MIN = 60_000;

/** What the photo shows, and what a summary's chart redrawn from it is compared with (±10 %). */
export const CHART_EXPECTED = {
  photoId: 'chart-photo',
  file: 'chart.jpg',
  tMs: 4 * MIN,
  chart: 'bar' as const,
  title: 'Ventas anuales (millones de €)',
  xLabel: 'Año',
  yLabel: 'Ventas (M€)',
  values: [
    { x: '2019', y: 12 },
    { x: '2020', y: 15 },
    { x: '2021', y: 9 },
    { x: '2022', y: 18 },
    { x: '2023', y: 21 },
  ],
  tolerance: 0.1,
  /** The photo's gridlines (chart-photo.mjs draws one every 5): a value is read no closer than half a step. */
  gridStep: 5,
};

const LINES = {
  intro: [
    'Hoy vamos a ver cómo se analiza la evolución de las ventas de una empresa.',
    'Una serie de ventas anuales nos dice si el negocio crece, se estanca o cae.',
    'Lo importante no es solo cuánto se vende, sino la tendencia y sus causas.',
  ],
  chart: [
    'Mirad la gráfica de barras de la pizarra: son las ventas anuales de la empresa entre 2019 y 2023, en millones de euros.',
    'Fijaos en la caída de 2021, el año de las restricciones, y en cómo se recupera después.',
    'Los dos últimos años son los más altos de la serie: la empresa no solo recupera, sino que supera lo que vendía antes.',
  ],
  analysis: [
    'Para interpretar una caída así hay que separar lo coyuntural de lo estructural.',
    'Una caída coyuntural se recupera cuando pasa la causa; una estructural no.',
    'En el examen os pediré que interpretéis una gráfica como esta y digáis qué tipo de caída es.',
  ],
};
const EXAM_PHRASE = 'Esto entra en el examen: distinguir una caída coyuntural de una estructural en una serie de ventas.';

const segmentText = (i: number): string => {
  if (i === 16) return EXAM_PHRASE;
  const pool = i < 7 ? LINES.intro : i < 12 ? LINES.chart : LINES.analysis;
  return [0, 1].map((k) => pool[(i + k) % pool.length]).join(' ');
};
const text = (t: string) => ({ type: 'text', text: t });

/** The fixture's files (the photo itself is made by chart-photo.mjs: media/chart.jpg). */
export function syntheticChartFixture() {
  return {
    lecture: { title: 'Tema 3 · La evolución de las ventas', language: 'es', durationMs: 10 * MIN, date: '2026-11-08', courseName: 'Economía de la empresa (check)', lectureNumber: 3, professor: 'Dr. Navarro' },
    courseSettings: { subjectType: 'business' as const, examFormat: 'essay' as const, summaryLanguage: null, sliders: null },
    transcript: Array.from({ length: 20 }, (_, i) => ({ startMs: i * 30_000, endMs: (i + 1) * 30_000, text: segmentText(i) })),
    notes: [
      { id: 'c3-h1', tMs: 30_000, text: 'Ventas: tendencia y causas', content: { type: 'heading', attrs: { level: 2, blockId: 'c3-h1' }, content: [text('Ventas: tendencia y causas')] } },
      { id: 'c3-p1', tMs: 4 * MIN + 20_000, text: 'gráfica pizarra → caída 2021, luego récord', content: { type: 'paragraph', attrs: { blockId: 'c3-p1' }, content: [text('gráfica pizarra → caída 2021, luego récord')] } },
      { id: 'c3-p2', tMs: 7 * MIN, text: 'coyuntural vs estructural', content: { type: 'paragraph', attrs: { blockId: 'c3-p2' }, content: [{ ...text('coyuntural vs estructural'), marks: [{ type: 'bold' }] }] } },
    ],
    marks: [
      { id: 'c3-mark-important', type: 'important' as const, level: 7, tMs: 4 * MIN + 30_000, note: 'la gráfica' },
      { id: 'c3-mark-exam', type: 'exam' as const, level: 8, tMs: 8 * MIN + 10_000, note: null },
    ],
    assistant: [] as { id: string; askedAtMs: number | null; windowStartMs: number | null; windowEndMs: number | null; question: string; answer: string }[],
    media: [{ id: CHART_EXPECTED.photoId, kind: 'photo' as const, tMs: CHART_EXPECTED.tMs, file: CHART_EXPECTED.file, name: 'Gráfica de ventas' }],
    request: {
      sliders: { startingPoint: 2, length: 5, depth: 6, examples: 5, visuals: 8, examFocus: 5, selfTest: 5, language: 4, extraResources: 6, followMarks: 7 },
      resources: { slides: false, photos: true, assistant: false },
    },
  };
}
