/**
 * plan.ts
 * Step 1.9: what the earlier version's data (the old `studiply.db`) becomes
 * in Supabase. Pure, so every rule is unit tested; legacyDb.ts reads the old
 * rows and run.ts sends the plan.
 *
 * Rules:
 *  - Ids and dates are kept (the old UUIDs become the new rows' ids), so an
 *    upload sent twice adds nothing.
 *  - project → course, folder → folder (parents first), session → lecture
 *    file + lecture, note → summaries (legacy-note-v1), transcript →
 *    transcript_segments (ms), audio → audio_chunks (20-minute chunks),
 *    photo / PDF → media.
 *  - Every section of an old note counts as written by the student
 *    (origin 'student'): the old app didn't record who wrote what, and
 *    regeneration must never overwrite what the student typed.
 *  - Old trash goes to Recently Deleted with its date; anything deleted more
 *    than 30 days ago (or inside something that was) is left out. A note in
 *    the old trash is left out (notes have no trash of their own now).
 */

import { LEGACY_NOTE_FORMAT, languageToDb, statusToDb, type LegacyNoteResult, type NoteBlockMeta } from '../../lib/cloudRows';
import { NOTE_BLOCKS } from '../../lib/noteBlocks';
import type { Json } from '../../types/supabase';
import type { Session } from '../../types/database';

// ── The old rows, as stored in studiply.db (src/lib/db.ts) ───────────────

export interface OldProfile { id: string; username: string; display_name: string | null; created_at: string }
export interface OldProject {
  id: string; user_id: string; name: string; color: string; icon: string; sort_order: number;
  is_archived: number; is_deleted: number; deleted_at: string | null; created_at: string; updated_at: string;
}
export interface OldFolder {
  id: string; user_id: string; project_id: string; parent_folder_id: string | null; name: string; sort_order: number;
  is_deleted: number; deleted_at: string | null; created_at: string; updated_at: string;
}
export interface OldSession {
  id: string; user_id: string; project_id: string | null; folder_id: string | null; title: string;
  recording_mode: string; language: string; status: string; duration_seconds: number | null;
  is_deleted: number; deleted_at: string | null; created_at: string; updated_at: string;
}
export interface OldSourceFile {
  id: string; session_id: string; user_id: string; file_type: string; file_path: string; file_size_bytes: number | null;
  mime_type: string | null; retention_policy: string; is_deleted: number; storage_path: string | null; created_at: string;
}
export interface OldTranscript {
  id: string; session_id: string; language: string; full_text: string; segments: string | null;
  confidence_score: number | null; created_at: string;
}
export interface OldNote {
  id: string; session_id: string; user_id: string; title: string; summary_level: string; summary: string | null;
  key_concepts: string; formulas: string; definitions: string; tags: string; unclear_parts: string;
  manual_annotations: string | null; is_confirmed: number; is_deleted: number; created_at: string; updated_at: string;
}

export interface LegacySnapshot {
  profiles: OldProfile[];
  projects: OldProject[];
  folders: OldFolder[];
  sessions: OldSession[];
  sourceFiles: OldSourceFile[];
  transcripts: OldTranscript[];
  notes: OldNote[];
}

// ── What goes to Supabase ────────────────────────────────────────────────

/** Where the old file may be: the app's copy (under source-files/) first, then the stored URI. */
export interface FileCandidates {
  storagePath: string | null;
  filePath: string;
}

export interface AudioItem {
  lectureId: string;
  seq: number;
  startMs: number;
  durationMs: number;
  status: 'uploaded' | 'transcribed';
  file: FileCandidates;
}

export interface MediaItem {
  id: string;
  lectureId: string;
  kind: 'photo' | 'slides';
  caption: string | null;
  sizeBytes: number | null;
  createdAt: string;
  file: FileCandidates;
}

export interface ImportPlan {
  courses: Record<string, unknown>[];
  /** Parents before their subfolders. */
  folders: Record<string, unknown>[];
  files: Record<string, unknown>[];
  lectures: Record<string, unknown>[];
  summaries: Record<string, unknown>[];
  transcripts: { lectureId: string; segments: { start_ms: number; end_ms: number; text: string }[] }[];
  audio: AudioItem[];
  media: MediaItem[];
  skipped: { oldTrash: number; deletedNotes: number };
}

export const CHUNK_MS = 20 * 60 * 1000;
const TRASH_DAYS = 30;
const DEFAULT_COLOR = '#F5E0D8';
const RETENTIONS = ['delete_now', 'delete_3_days', 'delete_manually', 'keep_permanently'];
/** Marks block metadata written by the import (the old app's device is unknown). */
export const IMPORT_DEVICE = 'earlier-version';

function parseJsonArray(text: string | null): Json[] {
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? (value as Json[]) : [];
  } catch {
    return [];
  }
}

function asSessionStatus(status: string): Session['status'] {
  const known: Session['status'][] = ['draft', 'recording', 'transcribing', 'processing', 'review', 'completed', 'failed'];
  return known.includes(status as Session['status']) ? (status as Session['status']) : 'draft';
}

function asRecordingMode(mode: string): Session['recording_mode'] {
  return mode === 'lecture' || mode === 'discussion' ? mode : 'standard';
}

/** The old note as a legacy-note-v1 result, every section the student's. */
export function noteResult(note: OldNote, session: OldSession | undefined): LegacyNoteResult {
  const level = note.summary_level === 'minimal' || note.summary_level === 'extra' ? note.summary_level : 'standard';
  const meta: NoteBlockMeta = { origin: 'student', editedAt: new Date(note.updated_at).toISOString(), device: IMPORT_DEVICE };
  return {
    format: LEGACY_NOTE_FORMAT,
    title: note.title,
    summaryLevel: level,
    recordingMode: session ? asRecordingMode(session.recording_mode) : null,
    summary: note.summary,
    keyConcepts: parseJsonArray(note.key_concepts),
    formulas: parseJsonArray(note.formulas),
    definitions: parseJsonArray(note.definitions),
    tags: parseJsonArray(note.tags).filter((t): t is string => typeof t === 'string'),
    unclearParts: parseJsonArray(note.unclear_parts),
    manualAnnotations: note.manual_annotations,
    isConfirmed: note.is_confirmed === 1,
    blocks: Object.fromEntries(NOTE_BLOCKS.map((b) => [b, meta])),
  };
}

/** Whisper segments in seconds (or the full text as one) → transcript_segments in ms. */
export function transcriptSegments(transcript: OldTranscript, durationMs: number | null) {
  const parsed = parseJsonArray(transcript.segments)
    .map((s) => s as { start?: unknown; end?: unknown; text?: unknown })
    .filter((s) => typeof s.start === 'number' && typeof s.end === 'number' && typeof s.text === 'string')
    .map((s) => {
      const start = Math.max(0, Math.round((s.start as number) * 1000));
      return { start_ms: start, end_ms: Math.max(start, Math.round((s.end as number) * 1000)), text: s.text as string };
    })
    .filter((s) => s.text.trim().length > 0);
  if (parsed.length > 0) return parsed;
  if (!transcript.full_text.trim()) return [];
  return [{ start_ms: 0, end_ms: Math.max(0, durationMs ?? 0), text: transcript.full_text }];
}

/** Each chunk's place: 20 minutes each, the last one what is left of the lecture. */
export function chunkTiming(count: number, durationSeconds: number | null): { startMs: number; durationMs: number }[] {
  return Array.from({ length: count }, (_, seq) => {
    const startMs = seq * CHUNK_MS;
    const isLast = seq === count - 1;
    const total = durationSeconds == null ? null : durationSeconds * 1000;
    const durationMs = isLast && total != null ? total - startMs : CHUNK_MS;
    return { startMs, durationMs: Math.max(1, Math.round(durationMs)) };
  });
}

function fileName(path: string): string | null {
  const last = decodeURIComponent(path.split('/').pop() ?? '').trim();
  return last || null;
}

/**
 * The plan for the chosen profiles. `now` decides which old trash is too
 * old (more than 30 days) to bring along.
 */
export function planImport(snapshot: LegacySnapshot, opts: { profileIds: string[]; now: Date }): ImportPlan {
  const chosen = new Set(opts.profileIds);
  const cutoff = new Date(opts.now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tooOld = (deletedAt: string | null) => deletedAt !== null && new Date(deletedAt).toISOString() < cutoff;
  const skipped = { oldTrash: 0, deletedNotes: 0 };

  const projects = new Map(snapshot.projects.filter((p) => chosen.has(p.user_id)).map((p) => [p.id, p]));
  const folders = new Map(snapshot.folders.filter((f) => chosen.has(f.user_id)).map((f) => [f.id, f]));
  const own = (d: { is_deleted: number; deleted_at: string | null }) =>
    d.is_deleted ? (d.deleted_at ?? opts.now.toISOString()) : null;

  // The deleted date an item has: its own, or the nearest trashed container's.
  const projectDeleted = (id: string | null) => {
    const p = id ? projects.get(id) : undefined;
    return p ? own(p) : null;
  };
  const folderDeleted = (id: string | null, seen = new Set<string>()): string | null => {
    const f = id ? folders.get(id) : undefined;
    if (!f || seen.has(f.id)) return null;
    seen.add(f.id);
    return own(f) ?? folderDeleted(f.parent_folder_id, seen) ?? projectDeleted(f.project_id);
  };
  const folderKept = (id: string | null) => {
    const f = id ? folders.get(id) : undefined;
    return !!f && projects.has(f.project_id) && !tooOld(folderDeleted(f.id));
  };

  const plan: ImportPlan = {
    courses: [], folders: [], files: [], lectures: [], summaries: [], transcripts: [], audio: [], media: [], skipped,
  };

  for (const p of projects.values()) {
    const deletedAt = own(p);
    if (tooOld(deletedAt)) {
      skipped.oldTrash++;
      continue;
    }
    plan.courses.push({
      id: p.id, name: p.name, color: /^#[0-9A-Fa-f]{6}$/.test(p.color) ? p.color : DEFAULT_COLOR, icon: p.icon || 'folder',
      sort_order: p.sort_order ?? 0, is_archived: p.is_archived === 1, deleted_at: deletedAt,
      created_at: p.created_at, updated_at: p.updated_at,
    });
  }
  const keptCourses = new Set(plan.courses.map((c) => c.id as string));

  // Folders, parents first.
  const depth = (f: OldFolder, seen = new Set<string>()): number => {
    const parent = f.parent_folder_id ? folders.get(f.parent_folder_id) : undefined;
    if (!parent || seen.has(f.id)) return 0;
    seen.add(f.id);
    return 1 + depth(parent, seen);
  };
  for (const f of [...folders.values()].sort((a, b) => depth(a) - depth(b))) {
    if (!keptCourses.has(f.project_id) || !folderKept(f.id) || (f.parent_folder_id && !folderKept(f.parent_folder_id))) {
      if (keptCourses.has(f.project_id) && tooOld(folderDeleted(f.id))) skipped.oldTrash++;
      continue;
    }
    plan.folders.push({
      id: f.id, course_id: f.project_id, parent_id: f.parent_folder_id, name: f.name, sort_order: f.sort_order ?? 0,
      deleted_at: folderDeleted(f.id), created_at: f.created_at, updated_at: f.updated_at,
    });
  }
  const keptFolders = new Set(plan.folders.map((f) => f.id as string));

  const keptSessions = new Map<string, OldSession>();
  for (const s of snapshot.sessions.filter((s) => chosen.has(s.user_id))) {
    const inProject = s.project_id !== null && projects.has(s.project_id);
    if (inProject && !keptCourses.has(s.project_id as string)) continue; // its course was too old
    const inFolder = s.folder_id !== null && folders.has(s.folder_id);
    if (inFolder && !keptFolders.has(s.folder_id as string)) continue; // its folder was too old
    const deletedAt = own(s) ?? (inFolder ? folderDeleted(s.folder_id) : null) ?? (inProject ? projectDeleted(s.project_id) : null);
    if (tooOld(deletedAt)) {
      skipped.oldTrash++;
      continue;
    }
    keptSessions.set(s.id, s);

    const audio = snapshot.sourceFiles
      .filter((f) => f.session_id === s.id && f.file_type === 'audio' && f.is_deleted === 0)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const transcript = snapshot.transcripts
      .filter((t) => t.session_id === s.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const durationMs = s.duration_seconds == null ? null : Math.round(s.duration_seconds * 1000);
    const retention = audio.find((a) => RETENTIONS.includes(a.retention_policy))?.retention_policy ?? 'delete_3_days';
    const confidence = transcript?.confidence_score;

    plan.files.push({
      id: s.id, kind: 'lecture', title: s.title, course_id: inProject ? s.project_id : null,
      folder_id: inFolder ? s.folder_id : null, deleted_at: deletedAt, created_at: s.created_at, updated_at: s.updated_at,
    });
    plan.lectures.push({
      id: s.id, language: languageToDb(s.language), status: statusToDb(asSessionStatus(s.status)), duration_ms: durationMs,
      recorded_at: s.created_at, audio_retention: retention,
      avg_confidence: typeof confidence === 'number' && confidence >= 0 && confidence <= 1 ? confidence : null,
      created_at: s.created_at, updated_at: s.updated_at,
    });

    if (transcript) {
      const segments = transcriptSegments(transcript, durationMs);
      if (segments.length > 0) plan.transcripts.push({ lectureId: s.id, segments });
    }

    const timing = chunkTiming(audio.length, s.duration_seconds);
    audio.forEach((a, seq) => {
      plan.audio.push({
        lectureId: s.id, seq, ...timing[seq], status: transcript ? 'transcribed' : 'uploaded',
        file: { storagePath: a.storage_path, filePath: a.file_path },
      });
    });

    for (const m of snapshot.sourceFiles.filter((f) => f.session_id === s.id && (f.file_type === 'photo' || f.file_type === 'pdf') && f.is_deleted === 0)) {
      plan.media.push({
        id: m.id, lectureId: s.id, kind: m.file_type === 'photo' ? 'photo' : 'slides',
        caption: m.file_type === 'pdf' ? fileName(m.storage_path ?? m.file_path) : null,
        sizeBytes: m.file_size_bytes, createdAt: m.created_at,
        file: { storagePath: m.storage_path, filePath: m.file_path },
      });
    }
  }

  for (const n of snapshot.notes.filter((n) => keptSessions.has(n.session_id))) {
    if (n.is_deleted === 1) {
      skipped.deletedNotes++;
      continue;
    }
    const session = keptSessions.get(n.session_id);
    const level = n.summary_level === 'minimal' || n.summary_level === 'extra' ? n.summary_level : 'standard';
    plan.summaries.push({
      id: n.id, file_id: n.session_id, mode: 'new', status: 'done', source_lecture_ids: [n.session_id],
      sliders: { summaryLevel: level }, result: noteResult(n, session), created_at: n.created_at, updated_at: n.updated_at,
    });
  }

  return plan;
}

// ── What the screen shows per profile, to choose ─────────────────────────

/** The hidden lecture holding a course's own uploads (not counted as a lecture). */
const PROJECT_FILES_TITLE = 'Project Files';

export interface ProfileSummary {
  id: string;
  name: string;
  createdAt: string;
  courses: number;
  folders: number;
  lectures: number;
  notes: number;
  transcripts: number;
  recordings: number;
  photos: number;
  pdfs: number;
  oldTrash: number;
  /** The first few names, to recognise the profile. */
  courseNames: string[];
  lectureTitles: string[];
}

export function summarizeProfiles(snapshot: LegacySnapshot, now: Date): ProfileSummary[] {
  return snapshot.profiles.map((p) => {
    const plan = planImport(snapshot, { profileIds: [p.id], now });
    const lectures = plan.files.filter((f) => f.title !== PROJECT_FILES_TITLE);
    return {
      id: p.id,
      name: p.display_name || p.username || 'Unnamed profile',
      createdAt: p.created_at,
      courses: plan.courses.length,
      folders: plan.folders.length,
      lectures: lectures.length,
      notes: plan.summaries.length,
      transcripts: plan.transcripts.length,
      recordings: new Set(plan.audio.map((a) => a.lectureId)).size,
      photos: plan.media.filter((m) => m.kind === 'photo').length,
      pdfs: plan.media.filter((m) => m.kind === 'slides').length,
      oldTrash: plan.skipped.oldTrash,
      courseNames: plan.courses.slice(0, 3).map((c) => c.name as string),
      lectureTitles: lectures.slice(0, 3).map((f) => f.title as string),
    };
  });
}
