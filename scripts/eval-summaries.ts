/**
 * eval-summaries.ts — the summary quality checks (step 7.5) on the test fixtures, run by Deno so it
 * uses the very files the summarize function uses (supabase/functions/_shared, npm:zod@4.6.7):
 *
 *   npm run eval:summaries                         every fixture's saved summary checked again: free, no network
 *   npm run eval:summaries -- --faults             faults planted in the saved summaries (a note left out, a mark
 *                                                  left out, a number not in the lecture, a paragraph in English,
 *                                                  40 % too long, a formula not in the lecture): free; fails if
 *                                                  a check misses one
 *   npm run eval:summaries -- --generate [--fixture <name>]
 *                                                  PAID: each fixture (or one) seeded into LOCAL Supabase as a
 *                                                  throwaway user, summarized by the local summarize function
 *                                                  (Claude, Opus 5.5), saved to tests/output/<name>/, then checked
 *
 * Fixtures: tests/fixtures/lectures/<name>/ (git-ignored; format in summary-fixture.ts). The synthetic
 * ones are written here when missing (scripts/fixtures/synthetic-lecture.mjs, 30 min; synthetic-long-
 * lecture.mjs, 90 min, step 7.6: --fixture synthetic-long). A summary saved by step
 * 7.4 (tests/output/synthetic-*.json) is checked against the synthetic fixture, except its marks
 * (their ids were random then).
 *
 * Local only for --generate: refuses unless Supabase is on 127.0.0.1 / localhost. Never reads
 * supabase/functions/.env and never prints a key (they're read from `supabase status`).
 */

import { syntheticLongFixture } from './fixtures/synthetic-long-lecture.mjs';
import { syntheticFixture } from './fixtures/synthetic-lecture.mjs';
import { FIXTURE_FILES, FixtureShape, REQUIRED_FIXTURE_FILES, fixtureInput, type Fixture } from '../supabase/functions/_shared/summary-fixture.ts';
import { PART_COST_USD, fixMarks, fixNotes, planParts, runChecks, sectionWords, summaryWords, wordsByPart, type CheckReport, type Section } from '../supabase/functions/_shared/summary-checks.ts';
import { fallbackClassification, planFor, settle, type LectureMaterial, type StoredSummary } from '../supabase/functions/_shared/summary-pipeline.ts';

const FIXTURES = 'tests/fixtures/lectures';
const OUTPUT = 'tests/output';
const args = Deno.args;
const mode = args.includes('--generate') ? 'generate' : args.includes('--faults') ? 'faults' : 'check';
const only = args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : null;

const exists = async (path: string) => !!(await Deno.stat(path).catch(() => null));
const readJson = async (path: string) => JSON.parse(await Deno.readTextFile(path));
const writeJson = (path: string, value: unknown) => Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);

// ---------- fixtures ----------

/** The synthetic lectures (30 min, step 7.4; 90 min, step 7.6) and their photos' files. */
const SYNTHETIC = [
  { name: 'synthetic', make: syntheticFixture },
  { name: 'synthetic-long', make: syntheticLongFixture },
];

/** Each synthetic lecture's folder, written once (its photos made from the app icon with macOS sips, as check:claude does). */
async function ensureSynthetic() {
  for (const { name, make } of SYNTHETIC) {
    const dir = `${FIXTURES}/${name}`;
    if (await exists(`${dir}/${FIXTURE_FILES.lecture}`)) continue;
    await Deno.mkdir(`${dir}/media`, { recursive: true });
    const f = make() as Record<string, unknown>;
    for (const [key, file] of Object.entries(FIXTURE_FILES)) if (f[key] !== undefined) await writeJson(`${dir}/${file}`, f[key]);
    for (const { file } of f.media as { file: string }[]) {
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

/** The newest saved summary of a fixture: tests/output/<name>/latest.json, else (synthetic) step 7.4's file. */
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

function context(fixture: Fixture, result: StoredSummary, legacy: boolean) {
  const { material, request } = fixtureInput(fixture);
  const plan = planFor(material, request, fallbackClassification(material));
  const targetWords = Number((result.appliedSettings as { targetWords?: number })?.targetWords ?? plan.length.targetWords);
  return { material, plan, options: { targetWords, hasHighMarks: plan.length.hasHighMarks, marksComparable: !legacy } };
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
    if (n < 6) failing += 1;
  }
  return failing;
}

// ---------- planted faults ----------

type Fault = { name: string; plant: (s: StoredSummary, m: LectureMaterial) => StoredSummary | null; caught: (r: CheckReport, s: StoredSummary, m: LectureMaterial) => boolean; needsMarks?: boolean };
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
];

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
      const r = runChecks(planted, material, plan, options);
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

async function generate(name: string, fixture: Fixture): Promise<void> {
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
  // The fixture's ids → new ones (a lecture exported from this same database keeps its rows); mapped back in the output.
  const ids = new Map<string, string>();
  const fresh = (id: string) => ids.get(id) ?? (ids.set(id, crypto.randomUUID()), ids.get(id)!);
  try {
    const user = createClient(env.API_URL, env.ANON_KEY, options);
    const signedIn = await user.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw new Error(`Could not sign in: ${signedIn.error.message}`);
    const token = signedIn.data.session!.access_token;
    const must = <T extends { error: { message: string } | null }>(r: T, what: string) => {
      if (r.error) throw new Error(`Could not add ${what}: ${r.error.message}`);
      return r;
    };
    for (const scope of ['assistant_summary', 'images']) must(await user.from('ai_consent').insert({ scope, policy_version: 'dev-2026-10-elevenlabs' }), `the ${scope} consent`);
    const course = must(await user.from('courses').insert({ name: fixture.lecture.courseName ?? 'Fixture course' }).select('id').single(), 'the course');
    const cs = fixture.courseSettings;
    must(
      await user
        .from('course_settings')
        .update({ subject_type: cs.subjectType, exam_format: cs.examFormat, summary_language: cs.summaryLanguage, professor: fixture.lecture.professor })
        .eq('course_id', course.data!.id),
      'the course settings',
    );
    const lectureFile = must(await user.from('files').insert({ kind: 'lecture', title: fixture.lecture.title, course_id: course.data!.id }).select('id').single(), 'the lecture file');
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
      const path = `${userId}/${lec}/${fresh(x.id)}.${mime.split('/')[1].replace('jpeg', 'jpg')}`;
      const bytes = await Deno.readFile(`${FIXTURES}/${name}/media/${x.file}`);
      must(await user.storage.from(bucket).upload(path, bytes, { contentType: mime }), `the file ${x.file}`);
      uploads.push({ bucket, path });
      must(await user.from('media').insert({ id: fresh(x.id), lecture_id: lec, kind: x.kind, storage_path: path, mime_type: mime, t_ms: x.tMs, caption: x.name ?? null }), 'a media row');
    }
    const { request } = fixtureInput(fixture);
    const req = must(
      await user.from('summaries').insert({ file_id: lec, mode: 'new', source_lecture_ids: [lec], sliders: request.sliders, status: 'pending', applied_settings: { resources: { ...request.resources, notes: true }, preview: '(eval)' } }).select('id').single(),
      'the request',
    );

    const started = Date.now();
    const res = await fetch(`${env.API_URL}/functions/v1/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ lectureId: lec, summaryId: req.data!.id }) });
    const body = await res.json().catch(() => ({}));
    if (res.status !== 202) throw new Error(`summarize answered ${res.status} ${body.code ?? ''}`);
    let row: { status: string; error: string | null; result: unknown } | null = null;
    for (const until = Date.now() + 8 * 60_000; Date.now() < until; await new Promise((r) => setTimeout(r, 3000))) {
      row = (await admin.from('summaries').select('status, error, result').eq('id', req.data!.id).single()).data;
      if (row?.status === 'done' || row?.status === 'failed') break;
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    // Each Claude call as billed, in order, kept with the output (read before the test user is deleted)
    // so a cost overrun can be traced. ai_usage has no call kind or cache split: tokens_input includes
    // cache reads and writes.
    type UsageRow = { created_at: string; operation: string; model: string; tokens_input: number; tokens_output: number; cost_usd: number };
    const usage: UsageRow[] = (await admin.from('ai_usage').select('created_at, operation, model, tokens_input, tokens_output, cost_usd').eq('user_id', userId).order('created_at')).data ?? [];
    const costUsd = usage.reduce((sum, r) => sum + Number(r.cost_usd), 0);
    const usageCalls = usage.map((r) => ({ at: r.created_at, operation: r.operation, model: r.model, tokensIn: r.tokens_input, tokensOut: r.tokens_output, costUsd: Number(r.cost_usd) }));
    for (const [i, u] of usageCalls.entries()) console.log(`    call ${i + 1}: ${u.model} · in ${u.tokensIn} · out ${u.tokensOut} · $${u.costUsd.toFixed(4)}`);
    console.log(`  ${row?.status ?? '?'} after ${seconds} s${row?.error ? ` (${row.error})` : ''}; ${usage.length} Claude calls, $${costUsd.toFixed(4)}`);
    if (row?.status !== 'done') return;
    // The output in the fixture's own ids.
    let json = JSON.stringify(row.result);
    for (const [mine, theirs] of ids) json = json.replaceAll(theirs, mine);
    await Deno.mkdir(`${OUTPUT}/${name}`, { recursive: true });
    const out = { fixture: name, at: new Date().toISOString(), seconds, costUsd, calls: usage.length, usage: usageCalls, result: JSON.parse(json) };
    const outFile = `${OUTPUT}/${name}/${out.at.slice(0, 19).replace(/[:T]/g, '-')}.json`;
    await writeJson(outFile, out);
    await writeJson(`${OUTPUT}/${name}/latest.json`, out);
    console.log(`  saved to ${outFile} and latest.json`);
  } finally {
    for (const u of uploads) await admin.storage.from(u.bucket).remove([u.path]);
    await admin.auth.admin.deleteUser(userId);
  }
}

// ---------- main ----------

await ensureSynthetic();
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
