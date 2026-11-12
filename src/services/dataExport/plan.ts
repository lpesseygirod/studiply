/**
 * plan.ts
 * "Export my data" (D6): from her rows and the list of her stored files, what goes
 * where in the ZIP. Pure: no network, no device; tested from fixtures.
 *
 *   README.txt                      what each folder holds
 *   settings.json                   her account, this device's settings, AI consent, Terms accepted
 *   data/<table>.json               every row of hers, as stored (machine-readable, GDPR art. 20)
 *   Courses/<course>/<folders…>/    her library as she sees it:
 *     <lecture>/                    My notes.md, Summary.md, other tabs (.md; a sheet as .csv),
 *                                   Transcript.txt ([06:40] lines), Marks.csv, Assistant.md,
 *                                   Notes (earlier format).md, Recording/0000.webm…, Photos/, Slides/
 *     <document>.md                 a document with one tab; with more tabs or photos, a folder
 *     <PDF or image>                files added to the library, as uploaded
 *     Flashcards.csv, Quizzes/<quiz>.md
 *   Other/                          what has no course
 *   Recently deleted/               what is in Recently Deleted, laid out the same way
 *   Profile photo.jpg
 */

import type { JSONContent } from '@tiptap/core';

import type { Tables } from '../../types/supabase';
import type { DocJSON } from '../../editor/types';
import { cellsOf, inputsOf } from '../../lib/sheetDoc';
import { Sheet } from '../../lib/sheets';
import { valueText } from '../../components/sheet/sheetClipboard';
import { docToMarkdown } from './markdown';
import { clock, extensionOf, NameSpace, safeName, toCsv } from './files';

export const EXPORT_TABLES = [
  'profiles',
  'courses',
  'course_settings',
  'folders',
  'files',
  'lectures',
  'documents',
  'document_versions',
  'marks',
  'audio_chunks',
  'transcript_segments',
  'media',
  'summaries',
  'assistant_messages',
  'flashcards',
  'review_schedule',
  'quizzes',
  'quiz_sources',
  'quiz_questions',
  'quiz_attempts',
  'quiz_answers',
  'ai_consent',
  'ai_usage',
  'terms_acceptances',
  // Her credits (every grant, purchase and spend).
  'credit_ledger',
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];
export type ExportTables = { [K in ExportTable]: Tables<K>[] };

export type ExportBucket = 'audio-chunks' | 'photos' | 'slides';

export interface ExportSnapshot {
  exportedAt: string;
  userId: string;
  email: string | null;
  /** This device's settings (Settings → Summaries, Recording, Storage; kept per device). */
  deviceSettings: Record<string, unknown>;
  tables: ExportTables;
  /** Her stored files' sizes in bytes, by bucket and path. A file that isn't listed is missing. */
  sizes: Record<ExportBucket, Record<string, number>>;
}

export interface PlannedText {
  path: string;
  text: string;
}

export interface PlannedFile {
  path: string;
  bucket: ExportBucket;
  storagePath: string;
  bytes: number;
  kind: 'recording' | 'photo' | 'pdf';
}

export interface ExportPlan {
  texts: PlannedText[];
  files: PlannedFile[];
  /** Stored files the rows point at that aren't in Storage (left out; README says so). */
  missing: number;
  counts: { courses: number; lectures: number; documents: number; recordings: number; photos: number; pdfs: number };
}

type FileRow = Tables<'files'>;
type DocRow = Tables<'documents'>;
type MediaRow = Tables<'media'>;

const DOC_KINDS = new Set(['lecture', 'document', 'unit_summary', 'exam_pack']);

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
}

function tabName(doc: DocRow, isLecture: boolean): string {
  if (doc.title) return doc.title;
  if (doc.tab === 'notes') return isLecture ? 'My notes' : 'Tab 1';
  if (doc.tab === 'summary') return 'Summary';
  if (doc.tab === 'transcript') return 'Transcript (document)';
  return 'Tab';
}

const TAB_ORDER: Record<string, number> = { notes: 0, summary: 1, transcript: 2 };
function tabSort(a: DocRow, b: DocRow): number {
  const fixed = (d: DocRow) => TAB_ORDER[d.tab] ?? 3;
  return fixed(a) - fixed(b) || (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at);
}

/** A sheet tab's values as CSV (rows 1…, columns A…), as she sees them. */
function sheetCsv(doc: DocRow): string {
  const sheet = Sheet.fromJSON(inputsOf(cellsOf(doc.content as unknown as DocJSON)));
  const addresses = sheet.addresses();
  if (!addresses.length) return '';
  const pos = addresses.map((a) => ({ a, col: a.match(/^[A-Z]+/)![0], row: Number(a.match(/\d+$/)![0]) }));
  const colIndex = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows = Math.max(...pos.map((p) => p.row));
  const cols = Math.max(...pos.map((p) => colIndex(p.col))) + 1;
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));
  for (const p of pos) grid[p.row - 1][colIndex(p.col)] = valueText(sheet.value(p.a));
  return toCsv(grid[0], grid.slice(1));
}

function legacyNote(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as Record<string, unknown>;
  const lines: string[] = [`# ${String(r.title ?? 'Notes')}`];
  if (typeof r.summary === 'string' && r.summary) lines.push('', '## Summary', '', r.summary);
  const section = (title: string, items: unknown) => {
    if (!Array.isArray(items) || !items.length) return;
    lines.push('', `## ${title}`, '');
    for (const it of items) {
      if (it && typeof it === 'object') {
        const o = it as Record<string, unknown>;
        const head = o.term ?? o.name ?? o.title ?? o.formula ?? '';
        const body = o.definition ?? o.explanation ?? o.description ?? o.text ?? '';
        lines.push(head ? `- **${String(head)}**${body ? ` — ${String(body)}` : ''}` : `- ${JSON.stringify(it)}`);
      } else lines.push(`- ${String(it)}`);
    }
  };
  section('Key concepts', r.keyConcepts);
  section('Definitions', r.definitions);
  section('Formulas', r.formulas);
  section('Unclear parts', r.unclearParts);
  if (Array.isArray(r.tags) && r.tags.length) lines.push('', `Tags: ${r.tags.map(String).join(', ')}`);
  return `${lines.join('\n')}\n`;
}

export function planExport(s: ExportSnapshot): ExportPlan {
  const t = s.tables;
  const texts: PlannedText[] = [];
  const files: PlannedFile[] = [];
  let missing = 0;
  const counts = { courses: t.courses.length, lectures: 0, documents: 0, recordings: 0, photos: 0, pdfs: 0 };

  const spaces = new Map<string, NameSpace>();
  const space = (dir: string) => {
    if (!spaces.has(dir)) spaces.set(dir, new NameSpace());
    return spaces.get(dir)!;
  };
  const addText = (dir: string, name: string, ext: string, text: string) => {
    if (!text) return;
    texts.push({ path: `${dir}${space(dir).take(name, ext)}`, text });
  };
  const addFile = (dir: string, name: string, bucket: ExportBucket, storagePath: string | null, kind: PlannedFile['kind']): string | null => {
    if (!storagePath) return null;
    const bytes = s.sizes[bucket][storagePath];
    if (bytes === undefined) {
      missing += 1;
      return null;
    }
    const ext = extensionOf(storagePath);
    const fileName = space(dir).take(safeName(name.replace(/\.[a-z0-9]{1,5}$/i, ''), 'File'), ext ? `.${ext}` : '');
    files.push({ path: `${dir}${fileName}`, bucket, storagePath, bytes, kind });
    if (kind === 'recording') counts.recordings += 1;
    else if (kind === 'photo') counts.photos += 1;
    else counts.pdfs += 1;
    return fileName;
  };

  // ── Where each course and folder goes ──
  const courses = new Map(t.courses.map((c) => [c.id, c]));
  const folders = new Map(t.folders.map((f) => [f.id, f]));
  const courseNames = new Map<string, string>();
  for (const root of ['Courses/', 'Recently deleted/Courses/']) {
    const ns = space(root);
    for (const c of [...t.courses].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))) {
      courseNames.set(`${root}${c.id}`, ns.take(safeName(c.name, 'Course')));
    }
  }
  const folderDir = new Map<string, string>();
  const dirOfFolder = (id: string, root: string, seen = new Set<string>()): string => {
    const key = `${root}${id}`;
    if (folderDir.has(key)) return folderDir.get(key)!;
    const f = folders.get(id);
    if (!f || seen.has(id)) return dirOfCourse(null, root);
    seen.add(id);
    const parent = f.parent_id ? dirOfFolder(f.parent_id, root, seen) : dirOfCourse(f.course_id, root);
    const dir = `${parent}${space(parent).take(safeName(f.name, 'Folder'))}/`;
    folderDir.set(key, dir);
    return dir;
  };
  function dirOfCourse(courseId: string | null, root: string): string {
    if (!courseId || !courses.has(courseId)) return root === 'Courses/' ? 'Other/' : 'Recently deleted/Other/';
    return `${root}${courseNames.get(`${root}${courseId}`)}/`;
  }
  const trashed = (f: FileRow): boolean => {
    if (f.deleted_at) return true;
    if (f.course_id && courses.get(f.course_id)?.deleted_at) return true;
    for (let id = f.folder_id, n = 0; id && n < 100; n++) {
      const folder = folders.get(id);
      if (!folder) break;
      if (folder.deleted_at) return true;
      id = folder.parent_id;
    }
    return false;
  };
  const dirOfFile = (f: FileRow) => {
    const root = trashed(f) ? 'Recently deleted/Courses/' : 'Courses/';
    return f.folder_id ? dirOfFolder(f.folder_id, root) : dirOfCourse(f.course_id, root);
  };

  // ── Rows by owner ──
  const docsByFile = groupBy(t.documents.filter((d) => !d.deleted_at), (d) => d.file_id);
  const mediaByLecture = groupBy(t.media.filter((m) => m.lecture_id), (m) => m.lecture_id as string);
  const mediaByFile = groupBy(t.media.filter((m) => !m.lecture_id && m.file_id), (m) => m.file_id as string);
  const chunksByLecture = groupBy(t.audio_chunks, (c) => c.lecture_id);
  const segmentsByLecture = groupBy(t.transcript_segments, (x) => x.lecture_id);
  const marksByLecture = groupBy(t.marks, (m) => m.lecture_id);
  const messagesByLecture = groupBy(t.assistant_messages, (m) => m.lecture_id);
  const notesByFile = groupBy(
    t.summaries.filter((x) => (x.result as { format?: unknown } | null)?.format === 'legacy-note-v1'),
    (x) => x.file_id,
  );

  /** Photos and PDFs of a lecture or document, in Photos/ and Slides/; returns media id → path. */
  const addMedia = (dir: string, rows: MediaRow[]): Map<string, string> => {
    const paths = new Map<string, string>();
    const photos = rows.filter((m) => m.kind === 'photo').sort((a, b) => a.created_at.localeCompare(b.created_at));
    const pdfs = rows.filter((m) => m.kind !== 'photo').sort((a, b) => a.created_at.localeCompare(b.created_at));
    photos.forEach((m, i) => {
      const name = addFile(`${dir}Photos/`, m.caption ?? `Photo ${i + 1}`, 'photos', m.storage_path, 'photo');
      if (name) paths.set(m.id, `Photos/${name}`);
    });
    pdfs.forEach((m, i) => {
      const name = addFile(`${dir}Slides/`, m.caption ?? `Slides ${i + 1}`, 'slides', m.storage_path, 'pdf');
      if (name) paths.set(m.id, `Slides/${name}`);
    });
    return paths;
  };

  const tabsOf = (dir: string, file: FileRow, photoPaths: Map<string, string>, prefix: string) => {
    const isLecture = file.kind === 'lecture';
    for (const doc of [...(docsByFile.get(file.id) ?? [])].sort(tabSort)) {
      const name = safeName(tabName(doc, isLecture), 'Tab');
      if (doc.kind === 'sheet') {
        addText(dir, name, '.csv', sheetCsv(doc));
      } else {
        const photoPath = (src: string) => {
          const id = src.startsWith('media:') ? src.slice('media:'.length) : null;
          const p = id ? photoPaths.get(id) : undefined;
          return p ? `${prefix}${p}` : null;
        };
        addText(dir, name, '.md', docToMarkdown(doc.content as JSONContent, { photoPath }));
      }
    }
  };

  for (const file of [...t.files].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))) {
    const parent = dirOfFile(file);
    const title = safeName(file.title, 'Untitled');

    if (file.kind === 'lecture') {
      counts.lectures += 1;
      const dir = `${parent}${space(parent).take(title)}/`;
      const photoPaths = addMedia(dir, mediaByLecture.get(file.id) ?? []);
      tabsOf(dir, file, photoPaths, '');
      const segments = [...(segmentsByLecture.get(file.id) ?? [])].sort((a, b) => a.start_ms - b.start_ms);
      addText(dir, 'Transcript', '.txt', segments.map((x) => `[${clock(x.start_ms)}] ${x.text}`).join('\n') + (segments.length ? '\n' : ''));
      const marks = [...(marksByLecture.get(file.id) ?? [])].sort((a, b) => a.t_ms - b.t_ms);
      if (marks.length) addText(dir, 'Marks', '.csv', toCsv(['time', 'type', 'level', 'note'], marks.map((m) => [clock(m.t_ms), m.type, m.level, m.note])));
      const messages = [...(messagesByLecture.get(file.id) ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
      addText(
        dir,
        'Assistant',
        '.md',
        messages.length ? `# Study assistant\n\n${messages.map((m) => `**${m.role === 'user' ? 'You' : 'Studiply'}:** ${m.content}`).join('\n\n')}\n` : '',
      );
      const legacy = notesByFile.get(file.id)?.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (legacy) addText(dir, 'Notes (earlier format)', '.md', legacyNote(legacy.result));
      for (const c of [...(chunksByLecture.get(file.id) ?? [])].sort((a, b) => a.seq - b.seq)) {
        addFile(`${dir}Recording/`, String(c.seq).padStart(4, '0'), 'audio-chunks', c.storage_path, 'recording');
      }
      continue;
    }

    if (DOC_KINDS.has(file.kind) || docsByFile.has(file.id)) {
      counts.documents += 1;
      const tabs = docsByFile.get(file.id) ?? [];
      const media = mediaByFile.get(file.id) ?? [];
      if (tabs.length === 1 && !media.length && tabs[0].kind !== 'sheet') {
        addText(parent, title, '.md', docToMarkdown(tabs[0].content as JSONContent) || `# ${file.title}\n`);
      } else {
        const dir = `${parent}${space(parent).take(title)}/`;
        tabsOf(dir, file, addMedia(dir, media), '');
      }
      continue;
    }

    // A PDF or image added to the library: the file itself, named after it.
    for (const m of mediaByFile.get(file.id) ?? []) {
      addFile(parent, file.title, m.kind === 'photo' ? 'photos' : 'slides', m.storage_path, m.kind === 'photo' ? 'photo' : 'pdf');
    }
  }

  // ── Flashcards and quizzes, per course ──
  for (const [courseId, cards] of groupBy(t.flashcards, (f) => f.course_id)) {
    const dir = dirOfCourse(courseId, courseId && courses.get(courseId)?.deleted_at ? 'Recently deleted/Courses/' : 'Courses/');
    addText(dir, 'Flashcards', '.csv', toCsv(['front', 'back', 'source', 'created'], cards.map((c) => [c.front, c.back, c.source, c.created_at])));
  }
  const questionsByQuiz = groupBy(t.quiz_questions, (q) => q.quiz_id);
  const attemptsByQuiz = groupBy(t.quiz_attempts, (a) => a.quiz_id);
  for (const quiz of t.quizzes) {
    const dir = `${dirOfCourse(quiz.course_id, quiz.deleted_at ? 'Recently deleted/Courses/' : 'Courses/')}Quizzes/`;
    const qs = [...(questionsByQuiz.get(quiz.id) ?? [])].sort((a, b) => a.position - b.position);
    const attempts = [...(attemptsByQuiz.get(quiz.id) ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at));
    const lines = [`# ${quiz.title}`, '', '## Questions', ''];
    qs.forEach((q, i) => {
      lines.push(`${i + 1}. ${q.prompt}`);
      if (q.answer_text) lines.push(`   - Answer: ${q.answer_text}`);
      if (q.explanation) lines.push(`   - Why: ${q.explanation}`);
    });
    if (attempts.length) {
      lines.push('', '## Your attempts', '');
      for (const a of attempts) lines.push(`- ${a.started_at.slice(0, 16).replace('T', ' ')}: ${a.points} of ${a.max_points} points${a.passed === null ? '' : a.passed ? ' (passed)' : ''}`);
    }
    addText(dir, safeName(quiz.title, 'Quiz'), '.md', `${lines.join('\n')}\n`);
  }

  // ── The profile photo ──
  const profile = t.profiles[0];
  if (profile?.avatar_path) addFile('', 'Profile photo', 'photos', profile.avatar_path, 'photo');

  // ── Settings and every row ──
  texts.push({
    path: 'settings.json',
    text: `${JSON.stringify(
      {
        exportedAt: s.exportedAt,
        account: { ...(profile ?? {}), id: s.userId, email: s.email },
        settingsOnThisDevice: s.deviceSettings,
        aiConsent: t.ai_consent,
        termsAccepted: t.terms_acceptances,
      },
      null,
      2,
    )}\n`,
  });
  for (const table of EXPORT_TABLES) texts.push({ path: `data/${table}.json`, text: `${JSON.stringify(t[table], null, 2)}\n` });

  texts.unshift({ path: 'README.txt', text: readme(s.exportedAt, counts, missing) });
  return { texts, files, missing, counts };
}

/** README.txt: what each folder and file holds, in English. */
export function readme(exportedAt: string, counts: ExportPlan['counts'], missing: number): string {
  return [
    'Your Studiply data',
    '==================',
    '',
    `Exported on ${exportedAt.slice(0, 10)} (UTC ${exportedAt.slice(11, 16)}).`,
    `${counts.courses} courses, ${counts.lectures} lectures, ${counts.documents} documents, ${counts.recordings} recording pieces, ${counts.photos} photos, ${counts.pdfs} PDFs and slides.`,
    '',
    'Courses/',
    '  Your library as you see it in Studiply: a folder per course and per folder inside it.',
    '  Each lecture is a folder with:',
    '    My notes.md, Summary.md and its other tabs  the documents, as Markdown (formulas as LaTeX);',
    '                                               a spreadsheet tab as a .csv file of its values',
    '    Transcript.txt       the transcript, one line per sentence, with its time in the recording',
    '    Marks.csv            your marks (Important, Confused, Exam), their level and time',
    '    Assistant.md         your questions to the study assistant and its answers',
    '    Notes (earlier format).md   notes made by an earlier version of Studiply',
    '    Recording/           the recording that is still kept, in 30-second pieces, in order',
    '                         (recordings deleted by their audio setting are not here)',
    '    Photos/, Slides/     the photos, PDFs and slides you added to the lecture',
    '  A document is a .md file, or a folder of its tabs when it has more than one tab or photos.',
    '  PDFs and images you added to the library are here as you uploaded them.',
    '  Flashcards.csv        the course\'s flashcards (front, back)',
    '  Quizzes/              each quiz: its questions, answers and your attempts',
    '',
    'Other/',
    '  Lectures, documents and cards that are not in a course.',
    '',
    'Recently deleted/',
    '  What is in Recently Deleted (removed for good 30 days after you deleted it), laid out the same way.',
    '',
    'settings.json',
    '  Your account (name, email), the settings saved on the device you exported from, when you',
    '  allowed or withdrew AI processing, and when you accepted the Terms and the Privacy Policy.',
    '',
    'data/',
    '  Every record Studiply keeps for your account, one JSON file per table, exactly as stored',
    '  (including earlier versions of your documents, your review progress and AI usage counts).',
    '  Use these to move your data to another service.',
    '',
    'Profile photo',
    '  Your profile photo, if you set one.',
    ...(missing ? ['', `${missing} stored file(s) could not be found and are not included.`] : []),
    '',
    'A large export comes in parts ("part 1 of 3"): text and data are in part 1, recordings and files',
    'follow in the same folders, so the parts unzipped into one folder give the whole export.',
    '',
  ].join('\n');
}
