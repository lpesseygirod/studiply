/**
 * summary-fixture.ts
 * A lecture saved as a test fixture (steps 7.1 and 7.5): the folder tests/fixtures/lectures/<name>/
 * (git-ignored), one JSON file per part, as BUILD-PLAN 7.1 lists them, and the summary pipeline's
 * input made from it (the same LectureMaterial and SummaryRequest the server reads), so the
 * evaluation script (scripts/eval-summaries.ts) runs a fixture exactly as a real lecture.
 *
 *   lecture.json          { title, language, durationMs, date, courseName, lectureNumber, professor }
 *   course-settings.json  { subjectType, examFormat, summaryLanguage, sliders }
 *   transcript.json       [{ startMs, endMs, text, chunkId? }]   (as transcribed, chunk overlaps and all)
 *   chunks.json           [{ id, seq, startMs, durationMs }]     (optional: then the overlaps are joined as on the server)
 *   notes.json            [{ id, tMs, text, content }]           (My notes' lines; content = the editor JSON)
 *   marks.json            [{ id, type, level, tMs, note }]
 *   assistant.json        [{ id, askedAtMs, windowStartMs, windowEndMs, question, answer }]
 *   media.json            [{ id, kind: photo | slides, tMs, file, name }]  (files in media/)
 *   request.json          { sliders, resources } (optional: else the course's sliders, everything ticked)
 *
 * Written by scripts/export-fixture.mjs (a local lecture) or by the evaluation (the synthetic one).
 */

import { z } from 'npm:zod@4.6.7';
import type { LectureMaterial, SummaryRequest } from './summary-pipeline.ts';
import { SLIDER_DEFAULTS, SLIDER_KEYS, type Sliders } from './summary-plan.ts';
import { SUBJECT_TYPES } from './summary-schema.ts';
import { joinSegmentRows, placeSegments } from './transcriptJoin.ts';

export const FIXTURE_FILES = {
  lecture: 'lecture.json',
  courseSettings: 'course-settings.json',
  transcript: 'transcript.json',
  chunks: 'chunks.json',
  notes: 'notes.json',
  marks: 'marks.json',
  assistant: 'assistant.json',
  media: 'media.json',
  request: 'request.json',
} as const;

/** The files that must be there (chunks and request are optional). */
export const REQUIRED_FIXTURE_FILES = ['lecture', 'courseSettings', 'transcript', 'notes', 'marks', 'assistant', 'media'] as const;

const ms = z.number().int().nonnegative();
const level = z.number().int().min(1).max(10);
const sliders = z.object(Object.fromEntries(SLIDER_KEYS.map((k) => [k, level])) as Record<(typeof SLIDER_KEYS)[number], typeof level>);

export const FixtureShape = z.object({
  lecture: z.object({
    title: z.string(),
    language: z.string().nullable(),
    durationMs: ms,
    date: z.string(),
    courseName: z.string().nullable(),
    lectureNumber: z.number().int().nullable(),
    professor: z.string().nullable(),
  }),
  courseSettings: z.object({
    subjectType: z.enum(SUBJECT_TYPES).nullable(),
    examFormat: z.enum(['multiple_choice', 'essay', 'problem_solving', 'open_book', 'oral']).nullable(),
    summaryLanguage: z.string().nullable(),
    sliders: sliders.nullable(),
  }),
  transcript: z.array(z.object({ startMs: ms, endMs: ms, text: z.string(), chunkId: z.string().nullable().optional() })),
  chunks: z.array(z.object({ id: z.string(), seq: z.number().int(), startMs: ms, durationMs: ms })).optional(),
  notes: z.array(z.object({ id: z.string(), tMs: ms.nullable(), text: z.string(), content: z.unknown() })),
  marks: z.array(z.object({ id: z.string(), type: z.enum(['important', 'confused', 'exam']), level, tMs: ms, note: z.string().nullable() })),
  assistant: z.array(
    z.object({ id: z.string(), askedAtMs: ms.nullable(), windowStartMs: ms.nullable(), windowEndMs: ms.nullable(), question: z.string(), answer: z.string() }),
  ),
  media: z.array(z.object({ id: z.string(), kind: z.enum(['photo', 'slides']), tMs: ms.nullable(), file: z.string(), name: z.string().optional() })),
  request: z
    .object({ sliders, resources: z.object({ slides: z.boolean(), photos: z.boolean(), assistant: z.boolean() }) })
    .optional(),
});
export type Fixture = z.infer<typeof FixtureShape>;

/** The pipeline's input from a fixture: the lecture as the server reads it, and the panel's request. */
export function fixtureInput(f: Fixture, lectureId = 'fixture'): { material: LectureMaterial; request: SummaryRequest } {
  const rows = f.transcript.map((s) => ({ start_ms: s.startMs, end_ms: s.endMs, text: s.text, chunk_id: s.chunkId ?? null }));
  const chunks = (f.chunks ?? []).map((c) => ({ id: c.id, seq: c.seq, start_ms: c.startMs, duration_ms: c.durationMs }));
  const joined = joinSegmentRows(placeSegments(rows, chunks)).sort((a, b) => a.start_ms - b.start_ms);
  const segments = joined.map((r) => ({ startMs: r.start_ms, endMs: r.end_ms, text: r.text }));
  const material: LectureMaterial = {
    lectureId,
    title: f.lecture.title,
    courseName: f.lecture.courseName,
    lectureNumber: f.lecture.lectureNumber,
    date: f.lecture.date,
    professor: f.lecture.professor,
    language: f.lecture.language,
    summaryLanguage: f.courseSettings.summaryLanguage,
    subjectType: f.courseSettings.subjectType,
    examFormat: f.courseSettings.examFormat,
    durationMs: Math.max(f.lecture.durationMs, segments.reduce((t, s) => Math.max(t, s.endMs), 0)),
    segments,
    notes: f.notes.map((n) => ({ id: n.id, tMs: n.tMs, text: n.text, content: n.content })),
    marks: f.marks.map((k) => ({ id: k.id, type: k.type, level: k.level, tMs: k.tMs, note: k.note })),
    questions: f.assistant,
    photos: f.media.filter((x) => x.kind === 'photo').map((x) => ({ id: x.id, tMs: x.tMs })),
    slides: f.media.filter((x) => x.kind === 'slides').map((x) => ({ id: x.id, name: x.name ?? x.file })),
  };
  const request: SummaryRequest = f.request ?? { sliders: (f.courseSettings.sliders as Sliders | null) ?? SLIDER_DEFAULTS, resources: { slides: true, photos: true, assistant: true } };
  return { material, request };
}
