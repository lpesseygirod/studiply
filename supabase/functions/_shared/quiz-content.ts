/**
 * quiz-content.ts
 * Everything the quiz function reads, as the student (RLS applies): the quiz and its
 * settings, each chosen lecture's material (summaryMaterial, as the summary reads it) and newest done
 * summary, the resources (PDFs and photos as Claude content only with the images consent; text
 * documents as text), the past exams' saved formats, the facts the calculator is given (the panel's
 * rules, quiz-input.ts), and the wrong questions that come back. Also a past exam's format, read on
 * Sonnet 5.5 and saved on its file once.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { summaryMaterial } from './lecture-content.ts';
import { MAX_MEDIA_BYTES, toBase64 } from './legacy-notes.ts';
import { CALCULATING_MODULES, pendingWrong, type MaterialLecture, type QuizMaterial } from './quiz-input.ts';
import type { AgainQuestion, QuizLecture, QuizResource, QuizRunMaterial } from './quiz-pipeline.ts';
import { QUIZ_SLIDER_DEFAULTS, type QuestionType } from './quiz-plan.ts';
import type { QuizSettings } from './quiz-settings.ts';
import type { PastExamFormatRead } from './quiz-zod.ts';
import type { Content, StoredSummary } from './summary-pipeline.ts';
import { SUMMARY_FORMAT } from './summary-schema.ts';

/** The summary's caps, for a quiz's resources. */
export const MAX_QUIZ_PHOTOS = 20;
export const MAX_QUIZ_PDFS = 3;

type Node = { type?: string; text?: string; content?: Node[]; attrs?: Record<string, unknown> };
const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'tableRow', 'callout', 'title']);

/** A document's text: its blocks as lines (formulas as $…$). */
export function docText(content: unknown): string {
  const lines: string[] = [];
  let line = '';
  const walk = (n: Node) => {
    if (n.type === 'text') line += n.text ?? '';
    else if (n.type === 'inlineMath' || n.type === 'blockMath') line += `$${String(n.attrs?.latex ?? '')}$`;
    else if (n.type === 'hardBreak') line += '\n';
    (n.content ?? []).forEach(walk);
    if (n.type && BLOCKS.has(n.type) && line.trim()) {
      lines.push(line.trim());
      line = '';
    }
  };
  if (content && typeof content === 'object') walk(content as Node);
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n');
}

/** A PDF's pages, counted in its bytes (its /Type /Page objects); null when none are found. */
export function pdfPages(bytes: Uint8Array): number | null {
  const text = new TextDecoder('latin1').decode(bytes);
  const n = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  return n > 0 ? n : null;
}

/** A file of hers as Claude content: a PDF or a photo (blocks, pages), or a document's text. */
export async function fileContent(
  db: SupabaseClient,
  file: { id: string; kind: string; title: string },
  images: boolean,
  budget: { bytes: number; photos: number; pdfs: number } = { bytes: 0, photos: 0, pdfs: 0 },
): Promise<{ kind: QuizResource['kind']; pages: number | null; text: string | null; blocks: Content } | { leftOut: 'images' | 'missing' | 'too_large' }> {
  if (file.kind === 'pdf' || file.kind === 'image') {
    if (!images) return { leftOut: 'images' };
    const photo = file.kind === 'image';
    if (photo ? budget.photos >= MAX_QUIZ_PHOTOS : budget.pdfs >= MAX_QUIZ_PDFS) return { leftOut: 'too_large' };
    const { data: media, error } = await db.from('media').select('storage_path, page_count, mime_type').eq('file_id', file.id).not('storage_path', 'is', null).order('created_at').limit(1).maybeSingle();
    if (error) throw error;
    if (!media) return { leftOut: 'missing' };
    const { data: blob, error: downloadError } = await db.storage.from(photo ? 'photos' : 'slides').download(media.storage_path as string);
    if (downloadError || !blob) return { leftOut: 'missing' };
    if (budget.bytes + blob.size > MAX_MEDIA_BYTES) return { leftOut: 'too_large' };
    budget.bytes += blob.size;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const data = toBase64(bytes);
    if (photo) {
      budget.photos += 1;
      return { kind: 'image', pages: 1, text: null, blocks: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }] };
    }
    budget.pdfs += 1;
    const pages = (media.page_count as number | null) ?? pdfPages(bytes);
    return { kind: 'pdf', pages, text: null, blocks: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }] };
  }
  // A document (or a Unit summary, an Exam pack): its tabs' text.
  const { data: tabs, error } = await db.from('documents').select('content').eq('file_id', file.id).is('deleted_at', null);
  if (error) throw error;
  const text = (tabs ?? []).map((t) => docText(t.content)).filter(Boolean).join('\n\n');
  return { kind: 'document', pages: null, text, blocks: [] };
}

/** The newest done summary of a lecture (studiply-summary-v1), or null. */
async function newestSummary(db: SupabaseClient, lectureId: string): Promise<StoredSummary | null> {
  const { data, error } = await db.from('summaries').select('result').eq('file_id', lectureId).eq('status', 'done').order('created_at', { ascending: false }).limit(5);
  if (error) throw error;
  const row = (data ?? []).find((r) => (r.result as { format?: unknown } | null)?.format === SUMMARY_FORMAT);
  return (row?.result as StoredSummary | undefined) ?? null;
}

/** Everything a quiz is written from (images: the student allowed photos and PDFs to be sent). */
export async function quizRunMaterial(db: SupabaseClient, quizId: string, settings: QuizSettings, courseId: string | null, images: boolean): Promise<QuizRunMaterial> {
  // The chosen lectures, in teaching order (as the panel lists them), hers and not in the trash.
  const { data: files, error: filesError } = await db.from('files').select('id, kind, title, created_at').in('id', [...settings.topic.lectureIds, ...settings.resources.fileIds, ...settings.pastExamIds]).is('deleted_at', null);
  if (filesError) throw filesError;
  const byId = new Map((files ?? []).map((f) => [String(f.id), f]));
  const lectureIds = settings.topic.lectureIds.filter((id) => byId.get(id)?.kind === 'lecture').sort((a, b) => String(byId.get(a)!.created_at).localeCompare(String(byId.get(b)!.created_at)));

  const lectures: QuizLecture[] = [];
  for (const [i, id] of lectureIds.entries()) {
    const [material, summary] = await Promise.all([summaryMaterial(db, id), newestSummary(db, id)]);
    lectures.push({ ref: `L${i + 1}`, material, summary: settings.resources.summaries ? summary : null });
  }

  // Resources: the files added, then (ticked) the lectures' own slides and photos.
  const resources: QuizResource[] = [];
  const leftOut: string[] = [];
  const budget = { bytes: 0, photos: 0, pdfs: 0 };
  const addResource = async (file: { id: string; kind: string; title: string }) => {
    const got = await fileContent(db, file, images, budget);
    if ('leftOut' in got) leftOut.push(file.title);
    else resources.push({ ref: `F${resources.length + 1}`, fileId: file.id, title: file.title, ...got });
  };
  for (const id of settings.resources.fileIds) {
    const f = byId.get(id);
    if (f && f.kind !== 'lecture') await addResource({ id, kind: String(f.kind), title: String(f.title) });
  }
  if (settings.resources.lectureMedia) {
    for (const l of lectures) {
      const { data: media, error } = await db.from('media').select('id, kind, file_id, caption, t_ms').eq('lecture_id', l.material.lectureId).in('kind', ['photo', 'slides']).not('storage_path', 'is', null).order('created_at');
      if (error) throw error;
      for (const x of media ?? []) {
        // A lecture's photo or PDF that is also a library file is read through its file; else its own row.
        const title = `${l.material.title} · ${x.kind === 'photo' ? 'photo' : 'slides'}${x.caption ? ` · ${x.caption}` : ''}`;
        if (x.file_id) await addResource({ id: String(x.file_id), kind: x.kind === 'photo' ? 'image' : 'pdf', title });
        else if (!images) leftOut.push(title);
        else await addLectureMedia(db, x as { id: string; kind: string }, l.material.lectureId, title, resources, budget, leftOut);
      }
    }
  }

  // The past exams: their formats as read (format only, never content).
  const pastExams: QuizRunMaterial['pastExams'] = [];
  for (const id of settings.pastExamIds) {
    const f = byId.get(id);
    if (!f) continue;
    const { data, error } = await db.from('files').select('past_exam_format').eq('id', id).maybeSingle();
    if (error) throw error;
    pastExams.push({ fileId: id, title: String(f.title), format: (data?.past_exam_format as PastExamFormatRead | null) ?? null });
  }

  const facts = await quizFacts(db, courseId, lectures);
  const again = await againQuestions(db, facts, lectureIds, settings);
  return { quizId, settings, facts, lectures, resources, leftOut, pastExams, again };
}

/** A lecture's own photo or slides (not a library file) as a resource, cited as its lecture's (and its page). */
async function addLectureMedia(db: SupabaseClient, x: { id: string; kind: string }, lectureId: string, title: string, resources: QuizResource[], budget: { bytes: number; photos: number; pdfs: number }, leftOut: string[]) {
  const photo = x.kind === 'photo';
  if (photo ? budget.photos >= MAX_QUIZ_PHOTOS : budget.pdfs >= MAX_QUIZ_PDFS) return void leftOut.push(title);
  const { data: row, error } = await db.from('media').select('storage_path, page_count').eq('id', x.id).single();
  if (error) throw error;
  const { data: blob } = await db.storage.from(photo ? 'photos' : 'slides').download(row.storage_path as string);
  if (!blob || budget.bytes + blob.size > MAX_MEDIA_BYTES) return void leftOut.push(title);
  budget.bytes += blob.size;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const data = toBase64(bytes);
  if (photo) budget.photos += 1;
  else budget.pdfs += 1;
  resources.push({
    ref: `F${resources.length + 1}`,
    fileId: lectureId,
    title,
    kind: photo ? 'image' : 'pdf',
    pages: photo ? 1 : ((row.page_count as number | null) ?? pdfPages(bytes)),
    text: null,
    blocks: [photo ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } } : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }],
  });
}

/** The calculator's facts, as the panel reads them (quiz.service.ts loadQuizMaterial), from the server's reads. */
async function quizFacts(db: SupabaseClient, courseId: string | null, lectures: QuizLecture[]): Promise<QuizMaterial> {
  const subjectType = lectures[0]?.material.subjectType ?? null;
  const facts: MaterialLecture[] = lectures.map((l) => {
    const m = l.material;
    const s = l.summary as (StoredSummary & { examSignals?: unknown[]; modulesUsed?: unknown[]; subjectType?: unknown }) | null;
    const modules = Array.isArray(s?.modulesUsed) ? s.modulesUsed : [];
    return {
      id: m.lectureId,
      title: m.title,
      folderId: null,
      durationMs: m.durationMs,
      hasTranscript: m.segments.length > 0,
      hasSummary: !!s,
      examSignals: Array.isArray(s?.examSignals) ? s.examSignals.length : 0,
      marks: m.marks.length,
      examMarks: m.marks.filter((k) => k.type === 'exam').length,
      confusedMarks: m.marks.filter((k) => k.type === 'confused').length,
      assistantWindows: new Set(m.questions.filter((q) => q.windowStartMs !== null).map((q) => `${q.windowStartMs}-${q.windowEndMs}`)).size,
      calculations: s ? modules.some((x) => CALCULATING_MODULES.includes(String(x))) || ['math', 'finance', 'science', 'programming'].includes(String(s.subjectType)) : null,
    };
  });
  let questions: QuizMaterial['questions'] = [];
  let answers: QuizMaterial['answers'] = [];
  if (courseId) {
    const { data: quizzes, error } = await db.from('quizzes').select('id').eq('course_id', courseId);
    if (error) throw error;
    const ids = (quizzes ?? []).map((q) => String(q.id));
    if (ids.length) {
      const q = await db.from('quiz_questions').select('id, from_question_id, source_file_id').in('quiz_id', ids);
      if (q.error) throw q.error;
      questions = (q.data ?? []).map((r) => ({ id: String(r.id), fromQuestionId: (r.from_question_id as string | null) ?? null, sourceFileId: (r.source_file_id as string | null) ?? null }));
      if (questions.length) {
        const a = await db.from('quiz_answers').select('question_id, verdict, answered_at').in('question_id', questions.map((x) => x.id));
        if (a.error) throw a.error;
        answers = (a.data ?? []).map((r) => ({ questionId: String(r.question_id), verdict: String(r.verdict), answeredAt: String(r.answered_at) }));
      }
    }
  }
  return { courseId: courseId ?? '', courseName: '', subjectType, defaults: QUIZ_SLIDER_DEFAULTS, folders: [], lectures: facts, files: [], questions, answers };
}

/** The originals of the wrong questions that may come back (the panel's rule), in the order asked. */
async function againQuestions(db: SupabaseClient, facts: QuizMaterial, lectureIds: string[], settings: QuizSettings): Promise<AgainQuestion[]> {
  if (!settings.choices.wrongComeBack) return [];
  const ids = pendingWrong(facts.questions, facts.answers, [...lectureIds, ...settings.resources.fileIds]);
  if (!ids.length) return [];
  const { data, error } = await db.from('quiz_questions').select('id, type, prompt, data, answer_text, explanation, hint, added_context, source_file_id, source_ms, source_page, mark_id, difficulty, created_at').in('id', ids);
  if (error) throw error;
  return (data ?? [])
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((r) => ({
      id: String(r.id),
      type: r.type as QuestionType,
      prompt: String(r.prompt),
      data: (r.data as Record<string, unknown>) ?? {},
      answerText: String(r.answer_text ?? ''),
      explanation: String(r.explanation ?? ''),
      hint: String(r.hint ?? ''),
      addedContext: String(r.added_context ?? ''),
      sourceFileId: (r.source_file_id as string | null) ?? null,
      sourceMs: (r.source_ms as number | null) ?? null,
      sourcePage: (r.source_page as number | null) ?? null,
      markId: (r.mark_id as string | null) ?? null,
      difficulty: r.difficulty as AgainQuestion['difficulty'],
    }));
}

/** Whether a file needs the images consent to be read (a PDF or a photo). */
export const needsImages = (kind: string) => kind === 'pdf' || kind === 'image';
