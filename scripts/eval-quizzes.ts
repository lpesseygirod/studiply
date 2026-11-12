/**
 * eval-quizzes.ts — the quiz checks (step 9.1b-2) on saved quizzes and on planted faults, run by Deno
 * so it uses the very files the quiz function uses (supabase/functions/_shared):
 *
 *   npm run eval:quizzes                       every saved quiz (tests/output/quiz-<fixture>/latest.json) checked
 *                                              again: free, no network
 *   npm run eval:quizzes -- --faults           faults planted in a hand-made good quiz (scripts/fixtures/
 *                                              quiz-good-answer.ts): free; fails if a check misses one
 *   npm run eval:quizzes -- --generate [--fixture synthetic-pair]
 *                                              PAID (≈ $0.35): the two synthetic Psicobiología lectures (Tema 1 and
 *                                              Tema 2) as one course, with a synthetic past exam (a text document),
 *                                              seeded into LOCAL Supabase as a throwaway user; a 10-question quiz
 *                                              (Exam focus 8) written by the local quiz function (the past exam's
 *                                              format read on Sonnet, the questions on Opus); saved to
 *                                              tests/output/quiz-synthetic-pair/, then checked
 *   npm run eval:quizzes -- --grading          step 9.1b-3, free: ~40 synthetic answers graded in code
 *                                              (scripts/fixtures/quiz-answers.ts) as expected, and each
 *                                              planted grading fault caught by them
 *   npm run eval:quizzes -- --grade            step 9.1b-3, PAID (≈ $0.03, cap $0.10): 8 written Spanish
 *                                              answers graded by Sonnet through the LOCAL quiz function
 *                                              (grade mode); each verdict among the right ones, reasons one
 *                                              line in Spanish, her own grade untouched; saved to
 *                                              tests/output/quiz-grade/
 *
 * What a saved quiz is checked for: it is ready; every question's data and form for its type (4 options
 * as the past exam has); its source one of the lectures (never the past exam: format only), its time
 * within the lecture; an exam-focus question within ±90 s of a flagged moment; written in Spanish; no
 * past exam stem copied; the types' mix close to the past exam's; the right option of multiple choice
 * not always in one place (4 or more of them); no hint giving its answer away; every Claude call with
 * its ai_usage row.
 *
 * Local only for --generate: refuses unless Supabase is on 127.0.0.1 / localhost. Never reads
 * supabase/functions/.env and never prints a key (they're read from `supabase status`).
 */

import { syntheticFixture } from './fixtures/synthetic-lecture.mjs';
import { syntheticTema2Fixture } from './fixtures/synthetic-tema2-lecture.ts';
import { goodAnswer, goodContext } from './fixtures/quiz-good-answer.ts';
import { evaluateAnswer, QUIZ_FAULTS } from './fixtures/quiz-faults.ts';
import { PAST_EXAM_EXPECTED, syntheticPastExam } from './fixtures/synthetic-past-exam.ts';
import { AI_ANSWERS, CODE_ANSWERS, GRADING_FAULTS, gradingMisses } from './fixtures/quiz-answers.ts';
import { gradeAnswer } from '../supabase/functions/_shared/quiz-grade.ts';
import { MAX_REASON } from '../supabase/functions/_shared/quiz-grading.ts';
import { CONSENT_POLICY_VERSION } from '../supabase/functions/_shared/policy.ts';
import { FixtureShape, fixtureInput, type Fixture } from '../supabase/functions/_shared/summary-fixture.ts';
import { formProblems, hintGivesAway, normalizePrompt, SPAN_SLACK_MS } from '../supabase/functions/_shared/quiz-checks.ts';
import { planInputFor, type MaterialLecture } from '../supabase/functions/_shared/quiz-input.ts';
import { planQuiz, QUIZ_SLIDER_DEFAULTS, type QuestionType } from '../supabase/functions/_shared/quiz-plan.ts';
import { DEFAULT_CHOICES, SETTINGS_VERSION, type QuizSettings } from '../supabase/functions/_shared/quiz-settings.ts';
import { checkData } from '../supabase/functions/_shared/quiz-zod.ts';
import { detectLanguage, sourcesOf } from '../supabase/functions/_shared/summary-checks.ts';

const OUTPUT = 'tests/output';
const args = Deno.args;
const mode = args.includes('--generate') ? 'generate' : args.includes('--faults') ? 'faults' : args.includes('--grading') ? 'grading' : args.includes('--grade') ? 'grade' : 'check';
const only = args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : null;
const MIN = 60_000;

const exists = async (path: string) => !!(await Deno.stat(path).catch(() => null));
const readJson = async (path: string) => JSON.parse(await Deno.readTextFile(path));
const writeJson = (path: string, value: unknown) => Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
const mark = (ok: boolean) => (ok ? 'PASS' : 'FAIL');

/** The two lectures of the course (the summary evaluation's synthetic ones), by name. */
const LECTURES: { name: string; fixture: () => Fixture }[] = [
  { name: 'synthetic', fixture: () => FixtureShape.parse(syntheticFixture()) },
  { name: 'synthetic-tema2', fixture: () => FixtureShape.parse(syntheticTema2Fixture()) },
];
const PAST_EXAM = 'past-exam';

// ---------- planted faults (free) ----------

function plantFaults(): number {
  console.log('\nFaults planted in the good quiz (scripts/fixtures/quiz-good-answer.ts)');
  // The synthetic Tema 1 lecture's own numbers, dates and formulas (as the quiz function reads them).
  const src = sourcesOf(fixtureInput(FixtureShape.parse(syntheticFixture()), 'synthetic').material);
  const base = evaluateAnswer(goodAnswer(), goodContext(), src);
  if (base.failed.length || base.dropped.length || base.kept.length !== goodAnswer().length) {
    console.log(`  the good quiz doesn't pass as it is: ${JSON.stringify({ failed: base.failed, dropped: base.dropped })}`);
    return 1;
  }
  let missed = 0;
  for (const f of QUIZ_FAULTS) {
    const answer = goodAnswer();
    const ctx = goodContext();
    f.plant(answer, ctx);
    const ok = f.caught(evaluateAnswer(answer, ctx, src));
    if (!ok) missed += 1;
    console.log(`  ${ok ? 'CAUGHT' : 'MISSED'} ${f.name}`);
  }
  return missed;
}

// ---------- a saved quiz checked again (free) ----------

interface SavedQuiz {
  fixture: string;
  at: string;
  seconds: number;
  costUsd: number;
  usage: { model: string; tokensIn: number; tokensOut: number; costUsd: number }[];
  quiz: { status: string; error: string | null; question_count: number; language: string | null; plan: { count: number }; checks: Record<string, unknown> | null };
  /** quiz_questions rows; source_file_id as the fixture's names ("synthetic", "synthetic-tema2", "past-exam"). */
  questions: Record<string, unknown>[];
  /** The flagged moments the server had (lecture name and ms). */
  flagged: { lecture: string; ms: number }[];
  pastExamFormat: Record<string, unknown> | null;
}

function checkSavedQuiz(s: SavedQuiz): number {
  const durations = new Map(LECTURES.map((l) => [l.name, l.fixture().lecture.durationMs]));
  const stems = syntheticPastExam()
    .content.content.map((p) => p.content[0].text.replace(/^\d+\.\s*(Verdadero o falso:\s*)?/, ''))
    .filter((t) => t.length >= 20 && !/^[a-d]\)/.test(t));
  const results: boolean[] = [];
  const line = (ok: boolean, what: string) => {
    results.push(ok);
    console.log(`  ${mark(ok)} ${what}`);
  };
  const q = s.questions;
  line(s.quiz.status === 'ready', `ready: ${s.quiz.status}${s.quiz.error ? ` (${s.quiz.error})` : ''}; ${q.length} of ${s.quiz.plan?.count ?? '?'} questions`);
  const formOff = q.filter((x) => {
    const parsed = checkData(x.type as QuestionType, JSON.stringify(x.data));
    return !parsed.ok || formProblems(x.type as QuestionType, x.data as Record<string, unknown>, PAST_EXAM_EXPECTED.optionsPerQuestion).length > 0;
  });
  line(formOff.length === 0, `every question's data and form for its type (${PAST_EXAM_EXPECTED.optionsPerQuestion} options for multiple choice)${formOff.length ? `: ${formOff.map((x) => x.position).join(', ')}` : ''}`);
  const sourceOff = q.filter((x) => x.focus !== 'again' && !(durations.has(String(x.source_file_id)) && typeof x.source_ms === 'number' && (x.source_ms as number) <= durations.get(String(x.source_file_id))!));
  line(sourceOff.length === 0, `every question's source a lecture and a time within it${sourceOff.length ? `: ${sourceOff.map((x) => `${x.position} (${x.source_file_id} ${x.source_ms})`).join(', ')}` : ''}`);
  line(!q.some((x) => x.source_file_id === PAST_EXAM), 'no question from the past exam (format only)');
  const exam = q.filter((x) => x.focus === 'exam');
  const off = exam.filter((x) => !s.flagged.some((f) => f.lecture === x.source_file_id && Math.abs((x.source_ms as number) - f.ms) <= SPAN_SLACK_MS));
  line(off.length === 0, `the ${exam.length} exam-focus questions within ±90 s of a flagged moment${off.length ? `; off: ${off.map((x) => `${x.source_file_id} ${x.source_ms}`).join(', ')}` : ''}`);
  const english = q.filter((x) => detectLanguage(`${x.prompt} ${x.explanation}`, 'es') === 'en');
  line(s.quiz.language === 'es' && english.length === 0, `in Spanish (${s.quiz.language}); ${english.length} in English`);
  const copied = q.filter((x) => stems.some((stem) => normalizePrompt(String(x.prompt)).includes(normalizePrompt(stem))));
  line(copied.length === 0, `no past exam question copied${copied.length ? `: ${copied.map((x) => x.prompt).join(' | ')}` : ''}`);
  const share = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 100);
  const mc = share(q.filter((x) => x.type === 'multiple_choice').length, q.length);
  const expected = share(PAST_EXAM_EXPECTED.types.multiple_choice, PAST_EXAM_EXPECTED.questionCount);
  line(Math.abs(mc - expected) <= 25, `the mix follows the past exam: ${mc} % multiple choice (the exam: ${expected} %, ±25 points)`);
  // Advisor, 8 Nov: the right option not always in one place (Claude puts it first; the server shuffles).
  const positions = q.filter((x) => x.type === 'multiple_choice').map((x) => (x.data as { correct: number }).correct);
  line(positions.length < 4 || new Set(positions).size > 1, `multiple choice: the right option not always in the same place (${positions.length ? positions.map((p) => 'ABCDEF'[p] ?? p).join(' ') : 'none'})`);
  // …and no hint giving its answer away (a content word of the right answer the question doesn't have).
  const giveaways = q.filter((x) => x.hint && hintGivesAway(String(x.hint), String(x.answer_text), String(x.prompt), s.quiz.language ?? 'es'));
  line(giveaways.length === 0, `no hint gives its answer away${giveaways.length ? `: ${giveaways.map((x) => `“${x.hint}” (${x.answer_text})`).join(' | ')}` : ''}; ${q.filter((x) => x.hint).length} hints kept, ${(s.quiz.checks as { hintsDropped?: number } | null)?.hintsDropped ?? '?'} dropped by the server`);
  const types: Record<string, number> = {};
  for (const x of q) types[String(x.type)] = (types[String(x.type)] ?? 0) + 1;
  console.log(`        types: ${Object.entries(types).map(([t, n]) => `${t} ${n}`).join(' · ')}; the format read: ${s.pastExamFormat ? JSON.stringify({ questionCount: s.pastExamFormat.questionCount, optionsPerQuestion: s.pastExamFormat.optionsPerQuestion }) : 'none'}`);
  const costLog = s.quiz.checks?.costLog as { calls: number; logged: number } | undefined;
  line(!!costLog && costLog.calls === costLog.logged && costLog.logged + (s.pastExamFormat ? 1 : 0) >= s.usage.length - 0, `every Claude call has its ai_usage row (server: ${costLog ? `${costLog.calls} calls, ${costLog.logged} logged` : 'no costLog'}; ai_usage: ${s.usage.length} rows)`);
  const checks = s.quiz.checks as { dropped?: { slot: number; reasons: string[] }[]; verify?: unknown; repair?: unknown; ms?: unknown } | null;
  if (checks) console.log(`        dropped: ${checks.dropped?.length ?? 0}${checks.dropped?.length ? ` (${checks.dropped.map((d) => `S${d.slot}: ${d.reasons.join('; ')}`).join(' · ')})` : ''}; verify ${JSON.stringify(checks.verify)}; repair ${JSON.stringify(checks.repair)}; ms ${JSON.stringify(checks.ms)}`);
  console.log(`        ${s.seconds} s, $${s.costUsd.toFixed(4)} (${s.usage.length} calls)`);
  return results.every(Boolean) ? 0 : 1;
}

async function checkSaved(): Promise<number> {
  let failing = 0;
  let found = 0;
  if (await exists(OUTPUT)) {
    for await (const e of Deno.readDir(OUTPUT)) {
      if (!e.isDirectory || !e.name.startsWith('quiz-')) continue;
      if (only && e.name !== `quiz-${only}`) continue;
      const path = `${OUTPUT}/${e.name}/latest.json`;
      if (!(await exists(path))) continue;
      found += 1;
      console.log(`\n${e.name}\n  ${path}`);
      failing += checkSavedQuiz(await readJson(path));
    }
  }
  if (!found) console.log('\nNo saved quiz yet (npm run eval:quizzes -- --generate, paid).');
  return failing;
}

// ---------- --generate: the quiz function, paid ----------

async function localSupabase(): Promise<Record<string, string>> {
  const out = await new Deno.Command('supabase', { args: ['status', '-o', 'env'], stdout: 'piped', stderr: 'null' }).output();
  const env = Object.fromEntries(
    new TextDecoder()
      .decode(out.stdout)
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
  if (!env.API_URL || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.API_URL)) throw new Error(`Refusing to run: Supabase is "${env.API_URL ?? 'not running'}", not local.`);
  return env;
}

const must = <T extends { error: { message: string } | null }>(r: T, what: string) => {
  if (r.error) throw new Error(`Could not add ${what}: ${r.error.message}`);
  return r;
};

/** The throwaway user's two lectures, past exam and quiz; the quiz written by the local function; saved and checked. */
async function generate(): Promise<number> {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const env = await localSupabase();
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, options);
  const email = `eval-quiz-${crypto.randomUUID().slice(0, 8)}@claude-check.test`;
  const password = `Pw-${crypto.randomUUID()}`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw new Error(`Could not create the test user: ${made.error.message}`);
  const userId = made.data.user.id;
  const ids = new Map<string, string>();
  const fresh = (id: string) => ids.get(id) ?? (ids.set(id, crypto.randomUUID()), ids.get(id)!);
  try {
    const user = createClient(env.API_URL, env.ANON_KEY, options);
    const signedIn = await user.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw new Error(`Could not sign in: ${signedIn.error.message}`);
    // The transcript permission only: the past exam is text, the lectures' photos aren't ticked.
    must(await user.from('ai_consent').insert({ scope: 'assistant_summary', policy_version: CONSENT_POLICY_VERSION }), 'the consent');
    const first = LECTURES[0].fixture();
    const course = must(await user.from('courses').insert({ name: first.lecture.courseName ?? 'Psicobiología (check)' }).select('id').single(), 'the course');
    const courseId = course.data!.id as string;
    must(await user.from('course_settings').update({ subject_type: first.courseSettings.subjectType, exam_format: first.courseSettings.examFormat, professor: first.lecture.professor }).eq('course_id', courseId), 'the course settings');

    // The lectures (as eval-summaries seeds them, without their photos), and their saved summaries when there are.
    const lectureIds: string[] = [];
    const facts: MaterialLecture[] = [];
    const flagged: { lecture: string; ms: number }[] = [];
    for (const { name, fixture } of LECTURES) {
      const f = fixture();
      const file = must(await user.from('files').insert({ kind: 'lecture', title: f.lecture.title, course_id: courseId }).select('id, created_at').single(), 'a lecture');
      const lec = file.data!.id as string;
      ids.set(name, lec);
      lectureIds.push(lec);
      must(await user.from('lectures').insert({ id: lec, language: f.lecture.language ?? 'es', duration_ms: f.lecture.durationMs, status: 'transcribing' }), 'the lecture');
      must(await user.from('transcript_segments').insert(f.transcript.map((s) => ({ lecture_id: lec, start_ms: s.startMs, end_ms: s.endMs, text: s.text }))), 'the transcript');
      const doc = must(await user.from('documents').insert({ file_id: lec, tab: 'notes' }).select('id').single(), 'My notes');
      if (f.notes.length) must(await user.from('note_lines').insert(f.notes.map((n, position) => ({ lecture_id: lec, document_id: doc.data!.id, block_id: n.id, t_ms: n.tMs, text: n.text, content: n.content, position }))), 'the notes');
      if (f.marks.length) must(await user.from('marks').insert(f.marks.map((k) => ({ id: fresh(k.id), lecture_id: lec, type: k.type, level: k.level, t_ms: k.tMs, note: k.note }))), 'the marks');
      for (const q of f.assistant) {
        must(await user.from('assistant_messages').insert({ id: fresh(q.id), lecture_id: lec, role: 'user', content: q.question, asked_at_ms: q.askedAtMs, window_start_ms: q.windowStartMs, window_end_ms: q.windowEndMs, status: 'done' }), 'a question');
        must(await user.from('assistant_messages').insert({ lecture_id: lec, role: 'assistant', content: q.answer, reply_to: fresh(q.id), window_start_ms: q.windowStartMs, window_end_ms: q.windowEndMs, status: 'done' }), 'an answer');
      }
      const summaryPath = `${OUTPUT}/${name}/latest.json`;
      let signals: { timestamp: string }[] | null = null;
      if (await exists(summaryPath)) {
        let json = JSON.stringify((await readJson(summaryPath)).result);
        for (const [mine, theirs] of ids) json = json.replaceAll(`"${mine}"`, `"${theirs}"`);
        const result = JSON.parse(json);
        must(await user.from('summaries').insert({ file_id: lec, mode: 'new', source_lecture_ids: [lec], sliders: f.request?.sliders ?? {}, status: 'done', result, applied_settings: { preview: '(eval, saved)' } }), 'a saved summary');
        signals = result.examSignals ?? [];
        console.log(`  ${name}: its saved summary seeded (${signals!.length} exam signals)`);
      }
      const at = (t: string) => {
        const m = /^(?:(\d+):)?(\d+):(\d{2})$/.exec(t.trim());
        return m ? ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 : null;
      };
      if (signals) signals.forEach((s) => at(s.timestamp) !== null && flagged.push({ lecture: name, ms: at(s.timestamp)! }));
      else f.marks.filter((k) => k.type === 'exam').forEach((k) => flagged.push({ lecture: name, ms: k.tMs }));
      facts.push({
        id: lec,
        title: f.lecture.title,
        folderId: null,
        durationMs: f.lecture.durationMs,
        hasTranscript: true,
        hasSummary: !!signals,
        examSignals: signals?.length ?? 0,
        marks: f.marks.length,
        examMarks: f.marks.filter((k) => k.type === 'exam').length,
        confusedMarks: f.marks.filter((k) => k.type === 'confused').length,
        assistantWindows: f.assistant.filter((q) => q.windowStartMs !== null).length,
        calculations: null,
      });
    }

    // The past exam: a text document of the course.
    const exam = syntheticPastExam();
    const examFile = must(await user.from('files').insert({ kind: 'document', title: exam.title, course_id: courseId }).select('id').single(), 'the past exam');
    const examId = examFile.data!.id as string;
    ids.set(PAST_EXAM, examId);
    must(await user.from('documents').insert({ file_id: examId, tab: 'notes', content: exam.content }), 'the past exam’s text');

    // The quiz as the New quiz panel saves it: 10 questions, Exam focus 8, the past exam attached.
    const settings: QuizSettings = {
      version: SETTINGS_VERSION,
      sliders: { ...QUIZ_SLIDER_DEFAULTS, count: 2, examFocus: 8 },
      choices: DEFAULT_CHOICES,
      topic: { wholeCourse: true, lectureIds },
      resources: { notes: true, summaries: true, lectureMedia: false, fileIds: [] },
      pastExamIds: [examId],
    };
    const plan = planQuiz(planInputFor({ courseId, courseName: '', subjectType: 'science', defaults: QUIZ_SLIDER_DEFAULTS, folders: [], lectures: facts, files: [], questions: [], answers: [] }, settings));
    const quiz = must(await user.from('quizzes').insert({ course_id: courseId, title: 'Psicobiología · eval', status: 'pending', settings, plan, question_count: plan.count }).select('id').single(), 'the quiz');
    const quizId = quiz.data!.id as string;
    must(await user.from('quiz_sources').insert([...lectureIds.map((file_id, position) => ({ quiz_id: quizId, role: 'lecture', file_id, position })), { quiz_id: quizId, role: 'past_exam', file_id: examId, position: 0 }]), 'the quiz sources');

    console.log(`  quiz: ${plan.preview}`);
    const started = Date.now();
    const res = await fetch(`${env.API_URL}/functions/v1/quiz`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signedIn.data.session!.access_token}` }, body: JSON.stringify({ quizId }) });
    const body = await res.json().catch(() => ({}));
    if (res.status !== 202) throw new Error(`quiz answered ${res.status} ${body.code ?? ''} (is \`supabase functions serve\` running with the new code?)`);
    let row: SavedQuiz['quiz'] | null = null;
    for (const until = Date.now() + 8 * MIN; Date.now() < until; await new Promise((r) => setTimeout(r, 3000))) {
      row = (await admin.from('quizzes').select('status, error, question_count, language, plan, checks').eq('id', quizId).single()).data;
      if (row?.status === 'ready' || row?.status === 'failed') break;
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    const usage = ((await admin.from('ai_usage').select('model, tokens_input, tokens_output, cost_usd').eq('user_id', userId).order('created_at')).data ?? []).map((r: { model: string; tokens_input: number; tokens_output: number; cost_usd: number }) => ({ model: r.model, tokensIn: r.tokens_input, tokensOut: r.tokens_output, costUsd: Number(r.cost_usd) }));
    const costUsd = usage.reduce((n: number, u: { costUsd: number }) => n + u.costUsd, 0);
    for (const [i, u] of usage.entries()) console.log(`    call ${i + 1}: ${u.model} · in ${u.tokensIn} · out ${u.tokensOut} · $${u.costUsd.toFixed(4)}`);
    console.log(`  ${row?.status ?? '?'} after ${seconds} s${row?.error ? ` (${row.error})` : ''}; ${usage.length} Claude calls, $${costUsd.toFixed(4)}`);
    const questions = (await admin.from('quiz_questions').select('position, type, prompt, data, answer_text, explanation, hint, added_context, source_file_id, source_ms, source_page, mark_id, focus, difficulty, from_question_id').eq('quiz_id', quizId).order('position')).data ?? [];
    const format = (await admin.from('files').select('past_exam_format').eq('id', examId).single()).data?.past_exam_format ?? null;

    // Saved in the fixtures' own names (the lectures, the past exam, the marks).
    let json = JSON.stringify({ quiz: row, questions, format });
    for (const [mine, theirs] of ids) json = json.replaceAll(theirs, mine);
    const back = JSON.parse(json);
    const saved: SavedQuiz = { fixture: 'synthetic-pair', at: new Date().toISOString(), seconds, costUsd, usage, quiz: back.quiz, questions: back.questions, flagged, pastExamFormat: back.format };
    const dir = `${OUTPUT}/quiz-synthetic-pair`;
    await Deno.mkdir(dir, { recursive: true });
    const file = `${dir}/${saved.at.slice(0, 19).replace(/[:T]/g, '-')}.json`;
    await writeJson(file, saved);
    await writeJson(`${dir}/latest.json`, saved);
    console.log(`  saved to ${file} and latest.json`);
    return checkSavedQuiz(saved);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
}

// ---------- --grading: answers graded in code (free) ----------

function checkGrading(): number {
  console.log(`\nAnswers graded in code (${CODE_ANSWERS.length}, scripts/fixtures/quiz-answers.ts)`);
  let failing = 0;
  const misses = new Set(gradingMisses(gradeAnswer));
  for (const a of CODE_ANSWERS) {
    const g = gradeAnswer(a.type, a.data, a.response);
    const ok = !misses.has(a.name);
    if (!ok) failing += 1;
    console.log(`  ${mark(ok)} ${a.name}: ${g.verdict} ${g.points}${ok ? '' : ` (expected ${a.expected}${a.points !== undefined ? ` ${a.points}` : ''})`}`);
  }
  console.log('\nGrading faults planted');
  for (const f of GRADING_FAULTS) {
    const caught = gradingMisses(f.grade);
    if (!caught.length) failing += 1;
    console.log(`  ${caught.length ? 'CAUGHT' : 'MISSED'} ${f.name}${caught.length ? ` (by ${caught.slice(0, 2).join('; ')})` : ''}`);
  }
  // The paid run's answers must reach Sonnet: code leaves each pending.
  for (const a of AI_ANSWERS.filter((x) => !x.hers)) {
    const g = gradeAnswer(a.type, a.data, { text: a.answer });
    if (g.verdict !== 'pending') {
      failing += 1;
      console.log(`  FAIL ${a.name}: code grades it ${g.verdict}, so --grade wouldn't send it`);
    }
  }
  return failing;
}

// ---------- --grade: Sonnet grades written answers (PAID) ----------

const GRADE_CAP_USD = 0.1;

async function gradeWithSonnet(): Promise<number> {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const env = await localSupabase();
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, options);
  const email = `eval-grade-${crypto.randomUUID().slice(0, 8)}@claude-check.test`;
  const password = `Pw-${crypto.randomUUID()}`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw new Error(`Could not create the test user: ${made.error.message}`);
  const userId = made.data.user.id;
  try {
    const user = createClient(env.API_URL, env.ANON_KEY, options);
    const signedIn = await user.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw new Error(`Could not sign in: ${signedIn.error.message}`);
    must(await user.from('ai_consent').insert({ scope: 'assistant_summary', policy_version: CONSENT_POLICY_VERSION }), 'the consent');
    const course = must(await user.from('courses').insert({ name: 'Psicobiología (grading check)' }).select('id').single(), 'the course');
    const settings = { version: SETTINGS_VERSION, sliders: QUIZ_SLIDER_DEFAULTS, choices: DEFAULT_CHOICES, topic: { wholeCourse: true, lectureIds: [] }, resources: { notes: true, summaries: true, lectureMedia: false, fileIds: [] }, pastExamIds: [] };
    const quiz = must(await user.from('quizzes').insert({ course_id: course.data!.id, title: 'Grading check', status: 'ready', language: 'es', settings, plan: {}, question_count: AI_ANSWERS.length }).select('id').single(), 'the quiz');
    const quizId = quiz.data!.id as string;
    const questions = must(
      await user.from('quiz_questions').insert(AI_ANSWERS.map((a, position) => ({ quiz_id: quizId, position, type: a.type, prompt: a.prompt, data: a.data, answer_text: a.data.modelAnswer }))).select('id, position'),
      'the questions',
    );
    const qid = new Map((questions.data ?? []).map((q: { id: string; position: number }) => [q.position, q.id]));
    const attempt = must(await user.from('quiz_attempts').insert({ quiz_id: quizId, max_points: AI_ANSWERS.length }).select('id').single(), 'the attempt');
    const attemptId = attempt.data!.id as string;
    must(
      await user.from('quiz_answers').insert(
        AI_ANSWERS.map((a, i) => ({
          attempt_id: attemptId,
          question_id: qid.get(i),
          response: { text: a.answer },
          ...(a.hers ? { verdict: a.hers, points: a.hers === 'correct' ? 1 : a.hers === 'partly' ? 0.5 : 0, graded_by: 'student' } : { verdict: 'pending', points: 0 }),
        })),
      ),
      'the answers',
    );

    const started = Date.now();
    const res = await fetch(`${env.API_URL}/functions/v1/quiz`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signedIn.data.session!.access_token}` }, body: JSON.stringify({ mode: 'grade', quizId, attemptId }) });
    const body = await res.json().catch(() => ({}));
    const seconds = Math.round((Date.now() - started) / 1000);
    if (res.status !== 200) throw new Error(`quiz (grade) answered ${res.status} ${body.code ?? ''} (is \`supabase functions serve\` running with the new code?)`);

    const rows = (await admin.from('quiz_answers').select('question_id, verdict, points, reason, graded_by').eq('attempt_id', attemptId)).data ?? [];
    const byQuestion = new Map(rows.map((r: { question_id: string }) => [r.question_id, r]));
    const usage = ((await admin.from('ai_usage').select('operation, model, tokens_input, tokens_output, cost_usd').eq('user_id', userId)).data ?? []) as { operation: string; model: string; tokens_input: number; tokens_output: number; cost_usd: number }[];
    const costUsd = usage.reduce((n, u) => n + Number(u.cost_usd), 0);
    const score = (await admin.from('quiz_attempts').select('points, score').eq('id', attemptId).single()).data;

    console.log(`\nSonnet's grades (${seconds} s, ${body.graded ?? '?'} graded, ${body.left ?? '?'} left; $${costUsd.toFixed(4)})`);
    let failing = 0;
    const check = (ok: boolean, what: string) => {
      if (!ok) failing += 1;
      console.log(`  ${mark(ok)} ${what}`);
    };
    const graded: { name: string; verdict: string; reason: string }[] = [];
    AI_ANSWERS.forEach((a, i) => {
      const r = byQuestion.get(qid.get(i) ?? '') as { verdict: string; reason: string; graded_by: string } | undefined;
      if (a.hers) return check(r?.verdict === a.hers && r?.graded_by === 'student' && !r?.reason, `${a.name}: still hers (${r?.verdict})`);
      graded.push({ name: a.name, verdict: r?.verdict ?? '?', reason: r?.reason ?? '' });
      check(!!r && r.graded_by === 'ai' && (a.allowed as string[]).includes(r.verdict), `${a.name}: ${r?.verdict ?? 'missing'} (allowed ${a.allowed.join('/')}) — “${r?.reason ?? ''}”`);
      check(!!r?.reason && !r.reason.includes('\n') && r.reason.length <= MAX_REASON, `${a.name}: its reason is one line`);
    });
    check(detectLanguage(graded.map((g) => g.reason).join(' '), 'es') === 'es', 'the reasons are in Spanish');
    const sum = rows.reduce((n: number, r: { points: number }) => n + Number(r.points), 0);
    check(Math.abs(Number(score?.points) - sum) < 1e-6, `the attempt's score follows the grades (${score?.points} points, ${score?.score} / 10)`);
    // Step 10.2-1b: grading is an extra, logged apart from writing a quiz.
    check(usage.length === 1 && usage[0].operation === 'quiz_grade' && usage[0].model === 'claude-sonnet-5-5', `one Sonnet call logged as quiz_grade (${usage.map((u) => `${u.operation}/${u.model}`).join(', ')})`);
    check(costUsd <= GRADE_CAP_USD, `under the cap ($${costUsd.toFixed(4)} ≤ $${GRADE_CAP_USD})`);

    const saved = { at: new Date().toISOString(), seconds, costUsd, usage, graded, score, response: body };
    const dir = `${OUTPUT}/quiz-grade`;
    await Deno.mkdir(dir, { recursive: true });
    await writeJson(`${dir}/${saved.at.slice(0, 19).replace(/[:T]/g, '-')}.json`, saved);
    await writeJson(`${dir}/latest.json`, saved);
    console.log(`  saved to ${dir}/latest.json`);
    return failing;
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
}

// ---------- main ----------

if (mode === 'grading') {
  const failing = checkGrading();
  console.log(failing ? `\n${failing} grading check(s) FAILED.` : '\nEvery answer graded as expected; every planted grading fault caught.');
  Deno.exit(failing ? 1 : 0);
}
if (mode === 'grade') {
  console.log('\nGrading 8 written answers with Sonnet (paid, ≈ $0.03)');
  Deno.exit((await gradeWithSonnet()) ? 1 : 0);
}
if (mode === 'faults') {
  const missed = plantFaults();
  console.log(missed ? `\n${missed} planted fault(s) MISSED.` : '\nEvery planted fault was caught.');
  Deno.exit(missed ? 1 : 0);
}
if (mode === 'generate') {
  if (only && only !== 'synthetic-pair') {
    console.log(`Unknown quiz fixture ${only} (there is synthetic-pair).`);
    Deno.exit(1);
  }
  console.log('\nsynthetic-pair: writing a quiz (paid)');
  Deno.exit((await generate()) ? 1 : 0);
}
const failing = await checkSaved();
console.log(failing ? `\n${failing} saved quiz(zes) with a failing check (see above).` : '\nEvery check passes on every saved quiz.');
Deno.exit(failing ? 1 : 0);
