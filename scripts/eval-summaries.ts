/**
 * eval-summaries.ts — the summary quality checks on the test fixtures, run by Deno so it
 * uses the very files the summarize function uses (supabase/functions/_shared, npm:zod@4.6.7):
 *
 *   npm run eval:summaries                         every fixture's saved summary checked again: free, no network
 *   npm run eval:summaries -- --faults             faults planted in the saved summaries (a note left out, a mark
 *                                                  left out, a number not in the lecture, a paragraph in English,
 *                                                  40 % too long, a formula not in the lecture; Lea, 6 Nov: a graph
 *                                                  from a photo not given, at Visuals 3, with 1 value, in the wrong
 *                                                  section): free; fails if a check misses one
 *   npm run eval:summaries -- --generate [--fixture <name>]
 *                                                  PAID: each fixture (or one) seeded into LOCAL Supabase as a
 *                                                  throwaway user, summarized by the local summarize function
 *                                                  (Claude, Sonnet 5.5 since Lea, 12 Nov), saved to tests/output/<name>/, then checked
 *   npm run eval:summaries -- --probe-schemas      ALMOST FREE: each structured-output schema the server
 *                                                  uses, sent once by the local summarize function with a one-line
 *                                                  text and max_tokens 16: accepted / rejected with the API's message
 *                                                  (a rejection costs nothing; an acceptance a fraction of a cent)
 *   npm run eval:summaries -- --extend             PAID, ≈ $0.20: Tema 1 (its saved summary) extended with
 *                                                  Tema 2, "Add to this summary": Tema 2 written by the generate call
 *                                                  with Tema 1's summary in its prompt; saved to tests/output/extend/
 *   npm run eval:summaries -- --exam-pack          PAID, ≈ $0.10: an Exam pack from the two saved
 *                                                  summaries (tests/output/synthetic/ and synthetic-tema2/, the latter
 *                                                  from --generate --fixture synthetic-tema2); saved to tests/output/exam-pack/
 *
 * Fixtures: tests/fixtures/lectures/<name>/ (git-ignored; format in summary-fixture.ts). The synthetic
 * ones are written here when missing (scripts/fixtures/synthetic-lecture.mjs, 30 min; synthetic-long-
 * lecture.mjs, 90 min: --fixture synthetic-long; synthetic-chart-lecture.ts, 10 min, a photo of a
 * bar chart, Lea 6 Nov: its photo drawn by .claude/skills/web-check/scripts/chart-photo.mjs, and its saved
 * summary's chart compared with the photo's values). A summary saved by the first
 * version (tests/output/synthetic-*.json) is checked against the synthetic fixture, except its marks
 * (their ids were random then).
 *
 * Local only for --generate: refuses unless Supabase is on 127.0.0.1 / localhost. Never reads
 * supabase/functions/.env and never prints a key (they're read from `supabase status`).
 */

import { syntheticLongFixture } from './fixtures/synthetic-long-lecture.mjs';
import { syntheticFixture } from './fixtures/synthetic-lecture.mjs';
import { CHART_EXPECTED, syntheticChartFixture } from './fixtures/synthetic-chart-lecture.ts';
import { syntheticTema2Fixture } from './fixtures/synthetic-tema2-lecture.ts';
import { stamp } from '../supabase/functions/_shared/assistant.ts';
import { CONSENT_POLICY_VERSION } from '../supabase/functions/_shared/policy.ts';
import type { Addition, ExamPack } from '../supabase/functions/_shared/summary-combine.ts';
import { existingSummaryText, summaryAnchors } from '../supabase/functions/_shared/summary-extend.ts';
import { FIXTURE_FILES, FixtureShape, REQUIRED_FIXTURE_FILES, fixtureInput, type Fixture } from '../supabase/functions/_shared/summary-fixture.ts';
import {
  PART_COST_USD,
  fixMarks,
  fixNotes,
  photoOf,
  planParts,
  runChecks,
  sectionAt,
  sectionWords,
  summaryWords,
  wordsByPart,
  type CheckOptions,
  type CheckReport,
  type Section,
} from '../supabase/functions/_shared/summary-checks.ts';
import { fallbackClassification, planFor, settle, type LectureMaterial, type StoredSummary } from '../supabase/functions/_shared/summary-pipeline.ts';
import type { Sliders, SummaryPlan } from '../supabase/functions/_shared/summary-plan.ts';

const FIXTURES = 'tests/fixtures/lectures';
const OUTPUT = 'tests/output';
const args = Deno.args;
const mode = args.includes('--probe-schemas') ? 'probe' : args.includes('--extend') ? 'extend' : args.includes('--exam-pack') ? 'examPack' : args.includes('--generate') ? 'generate' : args.includes('--faults') ? 'faults' : 'check';
const only = args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : null;

const exists = async (path: string) => !!(await Deno.stat(path).catch(() => null));
const readJson = async (path: string) => JSON.parse(await Deno.readTextFile(path));
const writeJson = (path: string, value: unknown) => Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);

// ---------- fixtures ----------

/** The synthetic lectures (30 min and 90 min) and their photos' files. */
const SYNTHETIC = [
  { name: 'synthetic', make: syntheticFixture },
  { name: 'synthetic-long', make: syntheticLongFixture },
  // The lecture after Tema 1 (a repeat, an exam statement about Tema 1, a correction).
  { name: 'synthetic-tema2', make: syntheticTema2Fixture },
  // Lea, 6 Nov: a photographed bar chart, redrawn as a chart; its photo is drawn by chart-photo.mjs, not the icon.
  { name: 'synthetic-chart', make: syntheticChartFixture, drawn: true },
];

/** The command that draws synthetic-chart's photo (the web-check folder's Chrome driver). */
const CHART_PHOTO_COMMAND = `node .claude/skills/web-check/scripts/chart-photo.mjs ${FIXTURES}/synthetic-chart/media/${CHART_EXPECTED.file}`;

/**
 * Each synthetic lecture's folder, written once (its photos made from the app icon with macOS sips, as
 * check:claude does; a photo already there is kept). A drawn photo (synthetic-chart) isn't made here.
 */
async function ensureSynthetic() {
  for (const { name, make, drawn } of SYNTHETIC) {
    const dir = `${FIXTURES}/${name}`;
    if (await exists(`${dir}/${FIXTURE_FILES.lecture}`)) continue;
    await Deno.mkdir(`${dir}/media`, { recursive: true });
    const f = make() as Record<string, unknown>;
    for (const [key, file] of Object.entries(FIXTURE_FILES)) if (f[key] !== undefined) await writeJson(`${dir}/${file}`, f[key]);
    for (const { file } of f.media as { file: string }[]) {
      if (await exists(`${dir}/media/${file}`)) continue;
      if (drawn) {
        console.log(`  (--generate needs media/${file}: ${CHART_PHOTO_COMMAND})`);
        continue;
      }
      const sips = await new Deno.Command('sips', { args: ['-s', 'format', 'jpeg', '-Z', '512', 'assets/icon.png', '--out', `${dir}/media/${file}`], stdout: 'null', stderr: 'null' }).output();
      if (!sips.success) console.log(`  (the photo could not be made with sips; --generate needs media/${file})`);
    }
    console.log(`Wrote the synthetic fixture: ${dir}`);
  }
}

async function readFixture(name: string): Promise<{ fixture: Fixture | null; problems: string[] }> {
  const dir = `${FIXTURES}/${name}`;
  const missing = [];
  for (const key of REQUIRED_FIXTURE_FILES) if (!(await exists(`${dir}/${FIXTURE_FILES[key]}`))) missing.push(FIXTURE_FILES[key]);
  if (missing.length) return { fixture: null, problems: [`missing ${missing.join(', ')}`] };
  const raw: Record<string, unknown> = {};
  for (const [key, file] of Object.entries(FIXTURE_FILES)) if (await exists(`${dir}/${file}`)) raw[key] = await readJson(`${dir}/${file}`);
  const parsed = FixtureShape.safeParse(raw);
  return parsed.success ? { fixture: parsed.data, problems: [] } : { fixture: null, problems: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) };
}

async function fixtureNames(): Promise<string[]> {
  const names: string[] = [];
  if (await exists(FIXTURES)) for await (const e of Deno.readDir(FIXTURES)) if (e.isDirectory) names.push(e.name);
  return names.sort().filter((n) => !only || n === only);
}

/** The newest saved summary of a fixture: tests/output/<name>/latest.json, else (synthetic) the first version's file. */
async function savedOutput(name: string): Promise<{ path: string; result: StoredSummary; legacy: boolean } | null> {
  const latest = `${OUTPUT}/${name}/latest.json`;
  if (await exists(latest)) return { path: latest, result: (await readJson(latest)).result, legacy: false };
  if (name !== 'synthetic' || !(await exists(OUTPUT))) return null;
  const old: string[] = [];
  for await (const e of Deno.readDir(OUTPUT)) if (e.isFile && /^synthetic-.*\.json$/.test(e.name)) old.push(e.name);
  const newest = old.sort().at(-1);
  return newest ? { path: `${OUTPUT}/${newest}`, result: (await readJson(`${OUTPUT}/${newest}`)).result, legacy: true } : null;
}

// ---------- the report ----------

const mark = (ok: boolean) => (ok ? 'PASS' : 'FAIL');

/** `sliders`: changed for a planted fault (Visuals 3). */
function context(fixture: Fixture, result: StoredSummary, legacy: boolean, sliders: Partial<Sliders> = {}) {
  const input = fixtureInput(fixture);
  const request = { ...input.request, sliders: { ...input.request.sliders, ...sliders } };
  const material = input.material;
  const plan = planFor(material, request, fallbackClassification(material));
  const targetWords = Number((result.appliedSettings as { targetWords?: number })?.targetWords ?? plan.length.targetWords);
  const options: CheckOptions = { targetWords, hasHighMarks: plan.length.hasHighMarks, marksComparable: !legacy, photos: request.resources.photos };
  return { material, plan, options };
}

function printReport(r: CheckReport, s: StoredSummary, m: LectureMaterial, legacy: boolean) {
  console.log(`  ${mark(r.schema.pass)} schema${r.schema.errors.length ? `: ${r.schema.errors.slice(0, 3).join('; ')}` : ''}`);
  console.log(`  ${mark(r.notes.pass)} notes coverage: ${r.notes.used}/${r.notes.total}${r.notes.missing.length ? ` (missing ${r.notes.missing.join(', ')}: put in by code)` : ''}`);
  if (legacy) console.log('  ---- marks coverage: not compared (this summary is older than its fixture: the mark ids were random)');
  else console.log(`  ${mark(r.marks.pass)} marks coverage: ${r.marks.used}/${r.marks.total}${r.marks.missing.length ? ` (missing ${r.marks.missing.join(', ')}: a chip by code)` : ''}${r.marks.effects.length ? `; effects missing: ${r.marks.effects.map((e) => `${e.need} for ${e.markId}`).join(', ')}` : ''}`);
  console.log(`  ${mark(r.length.pass)} length: ${r.length.words} words (target ${r.length.target}, allowed ${r.length.min}–${r.length.max}; ${Math.round((r.length.words / Math.max(1, r.length.target)) * 100)} %)`);
  const w = wordsByPart(s);
  const heads = (s.sections ?? []) as Section[];
  console.log(`        words: takeaways ${w.takeaways} · glossary ${w.glossary} · ${w.sections.map((n, i) => `section ${i + 1} "${(heads[i]?.heading ?? '').slice(0, 30)}" ${n}`).join(' · ')}`);
  console.log(`  ${mark(r.faithfulness.pass)} faithfulness: ${r.faithfulness.found}/${r.faithfulness.checked} numbers, dates and formulas found in the lecture`);
  for (const u of r.faithfulness.unverified.slice(0, 8)) console.log(`        not found: ${u.kind} "${u.value}" in ${u.path}: "${u.sentence.slice(0, 90)}"`);
  console.log(`  ${mark(r.language.pass)} language: expected ${r.language.expected ?? '?'}, detected ${r.language.detected ?? '?'}${r.language.offBlocks.length ? `; blocks in another language: ${r.language.offBlocks.map((b) => `section ${b.section + 1} block ${b.block + 1} (${b.detected})`).join(', ')}` : ''}`);
  // Lea, 6 Nov: the graphs redrawn from photos (and, from a stored report, what code did about them).
  const pc = r.photoCharts;
  if (pc) {
    const off = [...pc.removed.map((x) => `would take out ${x}`), ...pc.moved.map((x) => `would move ${x}`), ...pc.cleared.map((x) => `would clear ${x}`)];
    console.log(`  ${mark(pc.pass)} graphs from photos: ${pc.kept} kept, ${pc.approxValues} values read between gridlines (≈)${off.length ? `; ${off.join('; ')}` : ''}`);
  }
  const done = (s.checks as CheckReport | undefined)?.photoCharts;
  if (done && done.removed.length + done.moved.length + done.cleared.length) console.log(`        the server: removed ${done.removed.length}, moved ${done.moved.length}, cleared ${done.cleared.length}`);
  const parts = planParts(r, s, m);
  if (parts.length) {
    const cost = parts.reduce((sum, p) => sum + PART_COST_USD[p.kind], 0);
    console.log(`  A run would write again (≤ 3 calls, ≈ $${cost.toFixed(2)}): ${parts.map((p) => (p.kind === 'section' ? `section ${p.index + 1} (${p.reasons.join('; ')})` : p.kind === 'lists' ? `the lists (${p.reasons.join('; ')})` : `verify ${p.items.length} items`)).join(' · ')}`);
  }
  const stored = s.checks as CheckReport | undefined;
  if (stored?.regenerations?.length) console.log(`  The server wrote again: ${stored.regenerations.map((x) => `${x.part} (${x.reason}: ${x.ok ? 'done' : 'failed'})`).join(' · ')}`);
}

const passes = (r: CheckReport, legacy: boolean) => [r.schema.pass, r.notes.pass, legacy || r.marks.pass, r.length.pass, r.faithfulness.pass, r.language.pass].filter(Boolean).length;

async function checkSaved(): Promise<number> {
  let failing = 0;
  for (const name of await fixtureNames()) {
    console.log(`\n${name}`);
    const { fixture, problems } = await readFixture(name);
    if (!fixture) {
      console.log(`  the fixture can't be read: ${problems.join('; ')}`);
      failing += 1;
      continue;
    }
    const saved = await savedOutput(name);
    if (!saved) {
      console.log('  no saved summary yet (npm run eval:summaries -- --generate --fixture ' + name + ')');
      continue;
    }
    console.log(`  ${saved.path}${saved.legacy ? ' (saved by step 7.4)' : ''}`);
    const { material, plan, options } = context(fixture, saved.result, saved.legacy);
    const r = runChecks(saved.result, material, plan, options);
    printReport(r, saved.result, material, saved.legacy);
    const n = passes(r, saved.legacy);
    console.log(`  ${n} of 6 checks pass`);
    const chartOk = name === 'synthetic-chart' ? checkChartFromPhoto(saved.result) : true;
    if (n < 6 || !chartOk) failing += 1;
  }
  return failing;
}

/**
 * Lea, 6 Nov: synthetic-chart's summary has the photo's bar chart redrawn: one chart citing the photo, a
 * bar chart of one series, each value within ±10 % of the photo's or half its gridline step (the larger), in the photo's section, with the
 * photo at its time (the caption's mm:ss, written by the app: summaryDoc).
 */
function checkChartFromPhoto(s: StoredSummary): boolean {
  const e = CHART_EXPECTED;
  const sections = (s.sections ?? []) as Section[];
  const found = sections.flatMap((sec, si) => sec.blocks.filter((b) => photoOf(b) === e.photoId).map((b) => ({ b, si })));
  const results: boolean[] = [];
  const check = (ok: boolean, what: string) => {
    results.push(ok);
    console.log(`  ${mark(ok)} ${what}`);
  };
  check(found.length >= 1, `a graph redrawn from the photo (fromPhoto ${e.photoId}): ${found.length}`);
  const first = found[0];
  if (!first) return false;
  const { b, si } = first;
  const series = (Array.isArray(b.series) ? b.series : []) as { name: string; points: { x: string; y: number; approx?: boolean }[] }[];
  check(b.type === 'dataChart' && b.chart === e.chart, `its kind: ${b.type} ${String(b.chart ?? '')} (the photo: dataChart ${e.chart})`);
  check(series.length === 1, `its series: ${series.length} (the photo: 1)`);
  const points = series[0]?.points ?? [];
  const read = e.values.map((v) => ({ ...v, got: points.find((p) => String(p.x).trim() === v.x) }));
  // A value read off a photo is only as precise as its gridlines (advisor, 8 Nov): ±10 % or half a step, the larger.
  const allowed = (y: number) => Math.max(y * e.tolerance, e.gridStep / 2);
  const off = read.filter((v) => !v.got || Math.abs(v.got.y - v.y) > allowed(v.y));
  check(
    points.length === e.values.length && off.length === 0,
    `its values within max(±${e.tolerance * 100} %, ±${e.gridStep / 2}: half the photo's gridline step of ${e.gridStep}): ${read.map((v) => `${v.x} ${v.got ? `${v.got.approx ? '≈' : ''}${v.got.y}` : '—'} (${v.y} ±${allowed(v.y)})`).join(', ')}`,
  );
  check(si === sectionAt(sections, e.tMs), `in the photo's section (section ${si + 1})`);
  const photo = sections.flatMap((sec) => sec.blocks).find((x) => x.type === 'capturedImage' && x.imageId === e.photoId);
  check(String(photo?.timestamp ?? '') === stamp(e.tMs), `the photo at its time, for the caption “Redrawn from your photo at ${stamp(e.tMs)} — check the values”: ${String(photo?.timestamp ?? 'no photo block')}`);
  console.log(`        ${points.filter((p) => p.approx).length} values marked approximate (≈); title “${String(b.title ?? '')}”`);
  return results.every(Boolean);
}

// ---------- planted faults ----------

/**
 * `sliders`: the plan's sliders changed for this fault (Visuals 3); `options`: the checks' options
 * changed (graphs from photos allowed, as with Visuals 5+ and the photos sent).
 */
type Fault = {
  name: string;
  plant: (s: StoredSummary, m: LectureMaterial) => StoredSummary | null;
  caught: (r: CheckReport, s: StoredSummary, m: LectureMaterial) => boolean;
  needsMarks?: boolean;
  sliders?: Partial<Sliders>;
  options?: Partial<CheckOptions>;
};
const sectionsOf = (s: StoredSummary) => s.sections as Section[];
const firstText = (s: StoredSummary) => {
  for (const [si, sec] of sectionsOf(s).entries()) for (const [bi, b] of sec.blocks.entries()) if (b.type === 'paragraph' && typeof b.text === 'string') return { si, bi };
  return null;
};

const FAULTS: Fault[] = [
  {
    name: 'a note left out',
    plant: (s) => {
      const b = sectionsOf(s).flatMap((x) => x.blocks).find((x) => x.type === 'fromNotes' && (x.noteIds as string[]).length);
      if (!b) return null;
      (b.noteIds as string[]).shift();
      return s;
    },
    caught: (r, s, m) => !r.notes.pass && fixNotes(s, m).fixed.length > 0,
  },
  {
    name: 'a mark left out (no chip, no takeaway, nothing)',
    needsMarks: true,
    plant: (s, m) => {
      const id = m.marks[0]?.id;
      if (!id) return null;
      return JSON.parse(JSON.stringify(s).replaceAll(`"${id}"`, '""')) as StoredSummary;
    },
    caught: (r, s, m) => !r.marks.pass && fixMarks(s, m).fixed.length > 0,
  },
  {
    name: 'a number not in the lecture',
    plant: (s) => {
      const at = firstText(s);
      if (!at) return null;
      const b = sectionsOf(s)[at.si].blocks[at.bi];
      b.text = `${b.text} En el estudio participaron 98765 personas.`;
      return s;
    },
    caught: (r) => r.faithfulness.unverified.some((u) => u.value === '98765'),
  },
  {
    name: 'a formula not in the lecture',
    plant: (s) => {
      sectionsOf(s)[0]?.blocks.push({ type: 'formula', latex: '\\alpha = 4217 \\beta', variables: [], whenToUse: '' });
      return sectionsOf(s).length ? s : null;
    },
    caught: (r) => r.faithfulness.unverified.some((u) => u.kind === 'formula'),
  },
  {
    name: 'a paragraph in English',
    plant: (s) => {
      const at = firstText(s);
      if (!at) return null;
      sectionsOf(s)[at.si].blocks[at.bi].text = 'This is the part of the lecture where the professor explains how the nervous system produces behaviour and why it matters for the exam.';
      return s;
    },
    caught: (r, s, m) => r.language.offBlocks.length > 0 && planParts(r, s, m).some((p) => p.kind === 'section'),
  },
  {
    name: '40 % too long',
    plant: (s) => {
      const target = Number((s.appliedSettings as { targetWords?: number }).targetWords ?? 0);
      const longest = sectionsOf(s).reduce((a, b) => (sectionWords(b) > sectionWords(a) ? b : a), sectionsOf(s)[0]);
      if (!longest || !target) return null;
      const filler = longest.blocks.find((b) => b.type === 'paragraph' && typeof b.text === 'string');
      if (!filler) return null;
      while (summaryWords(s) < target * 1.4) longest.blocks.push({ ...filler });
      return s;
    },
    caught: (r, s, m) => !r.length.pass && r.length.words > r.length.max && planParts(r, s, m).some((p) => p.kind === 'section' && p.reasons.includes('shorten it')),
  },
  // Lea, 6 Nov: graphs redrawn from photos.
  {
    name: 'a graph from a photo it was not given (its values not in the lecture)',
    options: { photoCharts: true },
    plant: (s, m) => photoChart(s, m, { photo: 'not-a-photo', points: [{ x: 'a', y: 98765 }, { x: 'b', y: 4321 }] }),
    caught: (r) => r.photoCharts!.cleared.length > 0 && r.faithfulness.unverified.some((u) => u.value === '98765'),
  },
  {
    name: 'a graph from a photo at Visuals 3',
    sliders: { visuals: 3 },
    plant: (s, m) => photoChart(s, m, {}),
    caught: (r) => r.photoCharts!.removed.some((x) => x.includes('Visuals 5')),
  },
  {
    name: 'a graph from a photo with 1 value',
    options: { photoCharts: true },
    plant: (s, m) => photoChart(s, m, { points: [{ x: 'a', y: 7 }] }),
    caught: (r) => r.photoCharts!.removed.some((x) => x.includes('fewer than 2 values')),
  },
  {
    name: 'a graph from a photo in another section than its photo',
    options: { photoCharts: true },
    plant: (s, m) => photoChart(s, m, { elsewhere: true }),
    caught: (r) => r.photoCharts!.moved.length > 0,
  },
];

/**
 * A bar chart redrawn from the lecture's first photo (or `photo`), in that photo's section (or, with
 * `elsewhere`, another one); null when the lecture has no photo (or one section only, for elsewhere).
 */
function photoChart(s: StoredSummary, m: LectureMaterial, o: { photo?: string; points?: { x: string; y: number }[]; elsewhere?: boolean }): StoredSummary | null {
  const ph = m.photos[0];
  const sections = sectionsOf(s);
  if (!ph || !sections.length || (o.elsewhere && sections.length < 2)) return null;
  const home = sectionAt(sections, ph.tMs);
  const at = o.elsewhere ? (home === 0 ? 1 : 0) : home;
  const points = o.points ?? [{ x: 'a', y: 3 }, { x: 'b', y: 5 }];
  sections[at].blocks.push({ type: 'dataChart', chart: 'bar', title: 'Planted', xLabel: '', yLabel: '', series: [{ name: 's', points }], timestamp: '', fromPhoto: o.photo ?? ph.id });
  return s;
}

async function plantFaults(): Promise<number> {
  let missed = 0;
  for (const name of await fixtureNames()) {
    const { fixture } = await readFixture(name);
    const saved = fixture && (await savedOutput(name));
    if (!fixture || !saved) continue;
    console.log(`\n${name} — faults planted in ${saved.path}`);
    const { material, plan, options } = context(fixture, saved.result, saved.legacy);
    // From the summary as the server would store it (coverage complete), so each fault is the only one.
    const base = settle(fixMarks(fixNotes(saved.result, material).summary, material).summary, material, plan);
    for (const f of FAULTS) {
      if (f.needsMarks && saved.legacy) {
        console.log(`  ---- ${f.name}: skipped (the mark ids of a 7.4 summary can't be compared)`);
        continue;
      }
      const planted = f.plant(JSON.parse(JSON.stringify(base)), material);
      if (!planted) {
        console.log(`  ---- ${f.name}: no place to plant it in this summary`);
        continue;
      }
      const its: { plan: SummaryPlan; options: CheckOptions } = f.sliders ? context(fixture, saved.result, saved.legacy, f.sliders) : { plan, options };
      const r = runChecks(planted, material, its.plan, { ...its.options, ...f.options });
      const ok = f.caught(r, planted, material);
      if (!ok) missed += 1;
      console.log(`  ${ok ? 'CAUGHT' : 'MISSED'} ${f.name}`);
    }
  }
  return missed;
}

// ---------- --generate: the full pipeline, paid ----------

async function localSupabase(): Promise<Record<string, string>> {
  const out = await new Deno.Command('supabase', { args: ['status', '-o', 'env'], stdout: 'piped', stderr: 'null' }).output();
  const env = Object.fromEntries(
    new TextDecoder()
      .decode(out.stdout)
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
  if (!env.API_URL || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.API_URL)) throw new Error(`Refusing to run: Supabase is "${env.API_URL ?? 'not running'}", not local.`);
  return env;
}

// deno-lint-ignore no-explicit-any
type Client = any;
/** A throwaway local test user with the summary and images consents, deleted (with its files) afterwards. */
interface TestUser {
  env: Record<string, string>;
  admin: Client;
  user: Client;
  userId: string;
  token: string;
  /** The fixture's ids → new ones (a lecture exported from this same database keeps its rows); mapped back in the output. */
  fresh: (id: string) => string;
  ids: Map<string, string>;
  uploads: { bucket: string; path: string }[];
}

const must = <T extends { error: { message: string } | null }>(r: T, what: string) => {
  if (r.error) throw new Error(`Could not add ${what}: ${r.error.message}`);
  return r;
};

async function withTestUser(run: (t: TestUser) => Promise<void>): Promise<void> {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const env = await localSupabase();
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, options);
  const email = `eval-${crypto.randomUUID().slice(0, 8)}@claude-check.test`;
  const password = `Pw-${crypto.randomUUID()}`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw new Error(`Could not create the test user: ${made.error.message}`);
  const userId = made.data.user.id;
  const uploads: { bucket: string; path: string }[] = [];
  const ids = new Map<string, string>();
  const fresh = (id: string) => ids.get(id) ?? (ids.set(id, crypto.randomUUID()), ids.get(id)!);
  try {
    const user = createClient(env.API_URL, env.ANON_KEY, options);
    const signedIn = await user.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw new Error(`Could not sign in: ${signedIn.error.message}`);
    for (const scope of ['assistant_summary', 'images']) must(await user.from('ai_consent').insert({ scope, policy_version: CONSENT_POLICY_VERSION }), `the ${scope} consent`);
    await run({ env, admin, user, userId, token: signedIn.data.session!.access_token, fresh, ids, uploads });
  } finally {
    for (const u of uploads) await admin.storage.from(u.bucket).remove([u.path]);
    await admin.auth.admin.deleteUser(userId);
  }
}

/** The fixture's course with its settings; its id. */
async function seedCourse(t: TestUser, fixture: Fixture): Promise<string> {
  const course = must(await t.user.from('courses').insert({ name: fixture.lecture.courseName ?? 'Fixture course' }).select('id').single(), 'the course');
  const cs = fixture.courseSettings;
  must(
    await t.user
      .from('course_settings')
      .update({ subject_type: cs.subjectType, exam_format: cs.examFormat, summary_language: cs.summaryLanguage, professor: fixture.lecture.professor })
      .eq('course_id', course.data!.id),
    'the course settings',
  );
  return course.data!.id as string;
}

/** A fixture's lecture in that course: its transcript, notes, marks, questions and photos; its id. */
async function seedLecture(t: TestUser, courseId: string, name: string, fixture: Fixture): Promise<string> {
  const { user, fresh } = t;
  const lectureFile = must(await user.from('files').insert({ kind: 'lecture', title: fixture.lecture.title, course_id: courseId }).select('id').single(), 'the lecture file');
  const lec = lectureFile.data!.id as string;
  must(await user.from('lectures').insert({ id: lec, language: fixture.lecture.language ?? 'en', duration_ms: fixture.lecture.durationMs, status: 'transcribing' }), 'the lecture');
  if (fixture.chunks?.length) must(await user.from('audio_chunks').insert(fixture.chunks.map((c) => ({ id: fresh(c.id), lecture_id: lec, seq: c.seq, start_ms: c.startMs, duration_ms: c.durationMs, status: 'transcribed' }))), 'the chunks');
  must(await user.from('transcript_segments').insert(fixture.transcript.map((s) => ({ lecture_id: lec, start_ms: s.startMs, end_ms: s.endMs, text: s.text, chunk_id: s.chunkId ? fresh(s.chunkId) : null }))), 'the transcript');
  const doc = must(await user.from('documents').insert({ file_id: lec, tab: 'notes' }).select('id').single(), 'My notes');
  if (fixture.notes.length) must(await user.from('note_lines').insert(fixture.notes.map((n, position) => ({ lecture_id: lec, document_id: doc.data!.id, block_id: n.id, t_ms: n.tMs, text: n.text, content: n.content, position }))), 'the notes');
  if (fixture.marks.length) must(await user.from('marks').insert(fixture.marks.map((k) => ({ id: fresh(k.id), lecture_id: lec, type: k.type, level: k.level, t_ms: k.tMs, note: k.note }))), 'the marks');
  for (const q of fixture.assistant) {
    must(await user.from('assistant_messages').insert({ id: fresh(q.id), lecture_id: lec, role: 'user', content: q.question, asked_at_ms: q.askedAtMs, window_start_ms: q.windowStartMs, window_end_ms: q.windowEndMs, status: 'done' }), 'a question');
    must(await user.from('assistant_messages').insert({ lecture_id: lec, role: 'assistant', content: q.answer, reply_to: fresh(q.id), window_start_ms: q.windowStartMs, window_end_ms: q.windowEndMs, status: 'done' }), 'an answer');
  }
  for (const x of fixture.media) {
    const bucket = x.kind === 'photo' ? 'photos' : 'slides';
    const mime = x.kind === 'slides' ? 'application/pdf' : x.file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const path = `${t.userId}/${lec}/${fresh(x.id)}.${mime.split('/')[1].replace('jpeg', 'jpg')}`;
    const bytes = await Deno.readFile(`${FIXTURES}/${name}/media/${x.file}`);
    must(await user.storage.from(bucket).upload(path, bytes, { contentType: mime }), `the file ${x.file}`);
    t.uploads.push({ bucket, path });
    must(await user.from('media').insert({ id: fresh(x.id), lecture_id: lec, kind: x.kind, storage_path: path, mime_type: mime, t_ms: x.tMs, caption: x.name ?? null }), 'a media row');
  }
  return lec;
}

type UsageCall = { at: string; operation: string; model: string; tokensIn: number; tokensOut: number; costUsd: number };

/** A cost-log check failed in this run (the exit code says so). */
let costLogFailed = false;
const costLogged = (ok: boolean, what: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) costLogFailed = true;
};

/** Starts a pending summaries row on the local summarize function and waits for it; each Claude call as billed. */
async function runRow(t: TestUser, fileId: string, summaryId: string, minutes = 8) {
  const started = Date.now();
  const res = await fetch(`${t.env.API_URL}/functions/v1/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.token}` }, body: JSON.stringify({ lectureId: fileId, summaryId }) });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 202) throw new Error(`summarize answered ${res.status} ${body.code ?? ''}`);
  let row: { status: string; error: string | null; result: unknown } | null = null;
  for (const until = Date.now() + minutes * 60_000; Date.now() < until; await new Promise((r) => setTimeout(r, 3000))) {
    row = (await t.admin.from('summaries').select('status, error, result').eq('id', summaryId).single()).data;
    if (row?.status === 'done' || row?.status === 'failed') break;
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  // Each Claude call as billed, in order, kept with the output (read before the test user is deleted)
  // so a cost overrun can be traced. ai_usage has no call kind or cache split: tokens_input includes
  // cache reads and writes.
  type UsageRow = { created_at: string; operation: string; model: string; tokens_input: number; tokens_output: number; cost_usd: number };
  const usage: UsageRow[] = (await t.admin.from('ai_usage').select('created_at, operation, model, tokens_input, tokens_output, cost_usd').eq('user_id', t.userId).order('created_at')).data ?? [];
  const costUsd = usage.reduce((sum, r) => sum + Number(r.cost_usd), 0);
  const usageCalls: UsageCall[] = usage.map((r) => ({ at: r.created_at, operation: r.operation, model: r.model, tokensIn: r.tokens_input, tokensOut: r.tokens_output, costUsd: Number(r.cost_usd) }));
  for (const [i, u] of usageCalls.entries()) console.log(`    call ${i + 1}: ${u.model} · in ${u.tokensIn} · out ${u.tokensOut} · $${u.costUsd.toFixed(4)}`);
  console.log(`  ${row?.status ?? '?'} after ${seconds} s${row?.error ? ` (${row.error})` : ''}; ${usage.length} Claude calls, $${costUsd.toFixed(4)}`);
  // Every Claude call the server made has exactly one ai_usage row (else it escapes the daily limit).
  const costLog = (row?.result as { costLog?: { calls: number; logged: number } } | null)?.costLog;
  if (row?.status === 'done') {
    costLogged(!!costLog && costLog.calls === costLog.logged && costLog.logged === usage.length, `every Claude call has its ai_usage row (server: ${costLog ? `${costLog.calls} calls, ${costLog.logged} logged` : 'no costLog'}; ai_usage: ${usage.length} rows)`);
  }
  return { row, seconds, costUsd, usageCalls };
}

/** Saved as tests/output/<name>/<time>.json and latest.json, in the fixtures' own ids. */
async function saveOutput(t: TestUser, name: string, out: Record<string, unknown> & { result: unknown }) {
  let json = JSON.stringify(out.result);
  for (const [mine, theirs] of t.ids) json = json.replaceAll(theirs, mine);
  await Deno.mkdir(`${OUTPUT}/${name}`, { recursive: true });
  const at = new Date().toISOString();
  const saved = { fixture: name, at, ...out, result: JSON.parse(json) };
  const outFile = `${OUTPUT}/${name}/${at.slice(0, 19).replace(/[:T]/g, '-')}.json`;
  await writeJson(outFile, saved);
  await writeJson(`${OUTPUT}/${name}/latest.json`, saved);
  console.log(`  saved to ${outFile} and latest.json`);
}

async function generate(name: string, fixture: Fixture): Promise<void> {
  await withTestUser(async (t) => {
    const lec = await seedLecture(t, await seedCourse(t, fixture), name, fixture);
    const { request } = fixtureInput(fixture);
    const req = must(
      await t.user.from('summaries').insert({ file_id: lec, mode: 'new', source_lecture_ids: [lec], sliders: request.sliders, status: 'pending', applied_settings: { resources: { ...request.resources, notes: true }, preview: '(eval)' } }).select('id').single(),
      'the request',
    );
    const { row, seconds, costUsd, usageCalls } = await runRow(t, lec, req.data!.id);
    if (row?.status !== 'done') return;
    await saveOutput(t, name, { seconds, costUsd, calls: usageCalls.length, usage: usageCalls, result: row.result });
  });
}

// ---------- --probe-schemas ----------

/** Each schema through the local function: accepted / rejected with the API's message. The number rejected. */
async function probeSchemas(): Promise<number> {
  let rejected = 0;
  await withTestUser(async (t) => {
    const res = await fetch(`${t.env.API_URL}/functions/v1/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.token}` }, body: JSON.stringify({ probe: 'schemas' }) });
    const body = await res.json().catch(() => ({}));
    if (res.status !== 200) throw new Error(`summarize answered ${res.status} ${body.code ?? ''} (is \`supabase functions serve\` running with the new code?)`);
    type Result = { name: string; accepted: boolean; stopReason?: string; costUsd?: number; status?: number; type?: string; message?: string; ms: number };
    const results = body.results as Result[];
    for (const r of results) {
      if (r.accepted) console.log(`  ACCEPTED ${r.name} · ${r.stopReason} · $${(r.costUsd ?? 0).toFixed(5)} · ${r.ms} ms`);
      else console.log(`  REJECTED ${r.name} · HTTP ${r.status} ${r.type}: ${r.message}`);
    }
    rejected = results.filter((r) => !r.accepted).length;
    const cost = results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
    console.log(`  ${results.length - rejected} accepted, ${rejected} rejected; $${cost.toFixed(4)} in all`);
    // Each accepted (billed) call has exactly one ai_usage row.
    const rows = ((await t.admin.from('ai_usage').select('id').eq('user_id', t.userId)).data ?? []).length;
    const log = body.costLog as { calls: number; logged: number } | undefined;
    costLogged(!!log && log.calls === results.length - rejected && log.logged === log.calls && rows === log.calls, `every accepted call has its ai_usage row (server: ${log ? `${log.calls} calls, ${log.logged} logged` : 'no costLog'}; ai_usage: ${rows} rows)`);
  });
  return rejected;
}

// ---------- --extend and --exam-pack, paid ----------

/** A done summary row for a seeded lecture (a saved output: no call). */
async function seedSummary(t: TestUser, lectureId: string, result: StoredSummary, sliders: unknown): Promise<string> {
  const row = must(await t.user.from('summaries').insert({ file_id: lectureId, mode: 'new', source_lecture_ids: [lectureId], sliders, status: 'done', result, applied_settings: { preview: '(eval, saved)' } }).select('id').single(), 'a saved summary');
  return row.data!.id as string;
}

const line = (ok: boolean, what: string) => console.log(`  ${mark(ok)} ${what}`);

/**
 * PAID (≈ $0.20): Tema 1 (its saved summary, no call) extended with Tema 2, "Add to this summary" (the
 * approved plan): Tema 2 goes through the 7.4 generate call with Tema 1's summary in its prompt
 * (<existing-summary>), answering only what's new plus alreadyCovered and corrections; classify and at
 * most 3 check calls as for any summary. The anchors are Tema 1's blocks by their place in its summary
 * (summary-extend.ts summaryAnchors; the app sends its document's block ids, with the same words).
 * Saved: tests/output/extend/.
 */
async function extendRun(): Promise<void> {
  const tema1 = await savedOutput('synthetic');
  const f1 = (await readFixture('synthetic')).fixture;
  const f2 = (await readFixture('synthetic-tema2')).fixture;
  if (!tema1 || !f1 || !f2) return console.log('  needs Tema 1’s saved summary and both fixtures (npm run eval:summaries -- --generate --fixture synthetic)');
  await withTestUser(async (t) => {
    const course = await seedCourse(t, f1);
    const lec1 = await seedLecture(t, course, 'synthetic', f1);
    const lec2 = await seedLecture(t, course, 'synthetic-tema2', f2);
    const { request } = fixtureInput(f2);
    await seedSummary(t, lec1, tema1.result, request.sliders);
    const anchors = summaryAnchors(tema1.result);
    const sent = existingSummaryText(anchors);
    console.log(`  <existing-summary>: ${sent.blocks} blocks, ${sent.words} words${sent.left ? ` (${sent.left} left out: over the cap)` : ''}`);
    const req = must(
      await t.user
        .from('summaries')
        .insert({ file_id: lec1, mode: 'extend', source_lecture_ids: [lec1, lec2], sliders: request.sliders, status: 'pending', applied_settings: { resources: { ...request.resources, notes: true }, preview: '(eval)', target: 'add', anchors } })
        .select('id')
        .single(),
      'the Extend request',
    );
    const { row, seconds, costUsd, usageCalls } = await runRow(t, lec1, req.data!.id, 12);
    if (row?.status !== 'done') return;
    await saveOutput(t, 'extend', { seconds, costUsd, calls: usageCalls.length, usage: usageCalls, result: row.result });
    const r = row.result as { additions: Addition[]; checks?: { noRepeats: Record<string, number> } };
    const a = r.additions[0];
    console.log(`  added: ${a.keep.length} blocks · ${a.comments.length} comments · ${a.updates.length} updates · ${a.leftOut.length} left out · glossary +${a.glossary.length} · self-test +${a.selfTest.length} · flashcards +${a.flashcards.length}`);
    for (const c of a.comments) console.log(`    comment on ${c.anchor} “${c.quote}”: ${c.text}`);
    for (const u of a.updates) console.log(`    update after ${u.anchor || '(the end)'}: ${u.text}`);
    console.log(`  no repeats: ${JSON.stringify(r.checks?.noRepeats ?? {})}`);
    // What is added, in words (her notes aside: they're always added).
    type Sec = { heading: string; blocks: (Record<string, unknown> & { type: string })[] };
    const keptText = (a.summary.sections as Sec[])
      .flatMap((sec, si) => sec.blocks.filter((b, bi) => b.type !== 'fromNotes' && a.keep.includes(`s${si}-b${bi}`)).map((b) => JSON.stringify(b)))
      .join(' ');
    const checks = (a.summary.checks ?? {}) as { language?: { pass: boolean; offBlocks: unknown[] } };
    console.log(`  Tema 2 as written: ${(a.summary.sections as Sec[]).map((s) => s.heading).join(' · ')}; language ${checks.language?.pass ? 'PASS' : `FAIL ${JSON.stringify(checks.language?.offBlocks ?? [])}`}`);
    line(a.comments.some((c) => /examen|exam/i.test(c.text)), 'the exam statement about Tema 1 is a comment on Tema 1’s text');
    line(!/todo lo que hace un organismo/i.test(keptText), 'the definition said again is not added twice');
    line(a.comments.some((c) => /conducta|organismo|said again|record/i.test(c.text)), '… and is a comment on Tema 1’s definition');
    line(a.updates.some((u) => /Wallace/i.test(u.text)) && !/Wallace/i.test(keptText), 'the correction (Darwin and Wallace) is an Update, not a section');
    line(/neurona/i.test(keptText) && /sinapsis/i.test(keptText) && /potencial de acci/i.test(keptText), 'the new material (neuron, synapse, action potential) is added');
  });
}

/** PAID (≈ $0.10): an Exam pack from the two synthetic lectures’ saved summaries (no transcripts), one call. */
async function examPackRun(): Promise<void> {
  const tema1 = await savedOutput('synthetic');
  const tema2 = await savedOutput('synthetic-tema2');
  const f1 = (await readFixture('synthetic')).fixture;
  const f2 = (await readFixture('synthetic-tema2')).fixture;
  if (!tema1 || !tema2 || !f1 || !f2) return console.log('  needs both saved summaries (Tema 2’s: npm run eval:summaries -- --generate --fixture synthetic-tema2)');
  await withTestUser(async (t) => {
    const course = await seedCourse(t, f1);
    const lec1 = await seedLecture(t, course, 'synthetic', f1);
    const lec2 = await seedLecture(t, course, 'synthetic-tema2', f2);
    const { request } = fixtureInput(f1);
    await seedSummary(t, lec1, tema1.result, request.sliders);
    await seedSummary(t, lec2, tema2.result, request.sliders);
    const pack = must(await t.user.from('files').insert({ kind: 'exam_pack', title: 'Exam pack · Psicobiología (check)', course_id: course }).select('id').single(), 'the Exam pack file');
    const req = must(
      await t.user
        .from('summaries')
        .insert({ file_id: pack.data!.id, mode: 'exam_pack', source_lecture_ids: [lec1, lec2], sliders: request.sliders, status: 'pending', applied_settings: { resources: { ...request.resources, notes: true }, preview: '(eval)', target: 'unit', anchors: [] } })
        .select('id')
        .single(),
      'the Exam pack request',
    );
    const { row, seconds, costUsd, usageCalls } = await runRow(t, pack.data!.id, req.data!.id);
    if (row?.status !== 'done') return;
    await saveOutput(t, 'exam-pack', { seconds, costUsd, calls: usageCalls.length, usage: usageCalls, result: row.result });
    const p = (row.result as { pack: ExamPack }).pack;
    const signals = p.topics.flatMap((x) => x.examSignals);
    console.log(`  ${p.topics.length} topics · ${signals.length} exam signals · ${p.topics.reduce((n, x) => n + x.formulas.length, 0)} formulas · ${p.topics.reduce((n, x) => n + x.keyTerms.length, 0)} key terms · ${p.topics.reduce((n, x) => n + x.selfTest.length, 0)} questions · ${p.flashcards.length} flashcards`);
    for (const x of p.topics) console.log(`    ${x.heading}: ${x.examSignals.map((e) => `L${e.lecture} ${e.t}`).join(', ')}`);
    line(signals.some((e) => e.lecture === 1) && signals.some((e) => e.lecture === 2), 'exam signals from both lectures');
    line(signals.some((e) => /cinco preguntas/i.test(e.text)), 'Tema 1’s exam phrase (the five questions) is kept');
    line(signals.some((e) => /todo o nada/i.test(e.text)), 'Tema 2’s exam phrase (all or nothing) is kept');
  });
}

// ---------- main ----------

await ensureSynthetic();
if (mode === 'probe') {
  console.log('\nSchema probe (the local summarize function; each schema with max_tokens 16)');
  Deno.exit((await probeSchemas()) || costLogFailed ? 1 : 0);
}
if (mode === 'extend') {
  console.log('\nExtend: Tema 1 + Tema 2, "Add to this summary" (paid)');
  await extendRun();
  Deno.exit(costLogFailed ? 1 : 0);
}
if (mode === 'examPack') {
  console.log('\nExam pack: Tema 1 + Tema 2 (paid)');
  await examPackRun();
  Deno.exit(costLogFailed ? 1 : 0);
}
if (mode === 'generate') {
  for (const name of await fixtureNames()) {
    const { fixture, problems } = await readFixture(name);
    console.log(`\n${name}: generating (paid)`);
    if (!fixture) {
      console.log(`  the fixture can't be read: ${problems.join('; ')}`);
      continue;
    }
    await generate(name, fixture);
  }
}
if (mode === 'faults') {
  const missed = await plantFaults();
  console.log(missed ? `\n${missed} planted fault(s) MISSED.` : '\nEvery planted fault was caught.');
  Deno.exit(missed ? 1 : 0);
}
const failing = await checkSaved();
console.log(failing ? `\n${failing} fixture(s) with a failing check (see above).` : '\nEvery check passes on every fixture.');
if (costLogFailed) {
  console.log('A Claude call without its ai_usage row (see above): it would escape the daily limit.');
  Deno.exit(1);
}
