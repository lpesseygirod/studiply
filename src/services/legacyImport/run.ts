/**
 * run.ts
 * Step 1.9: sends the plan (./plan.ts) to Supabase, checks it arrived, and
 * remembers where it went.
 *
 *  - Order: courses → folders (parents first) → lecture files → lectures →
 *    notes → transcripts → recordings → photos/PDFs.
 *  - Safe to run twice and to resume after a failure: rows are upserted by
 *    their old ids with ignoreDuplicates; transcripts, recordings and
 *    photos/PDFs already on the server are skipped; files go to fixed paths.
 *  - A file that is no longer on this iPhone is listed, not uploaded; the
 *    rest of its lecture still is.
 *  - "Already uploaded" is remembered per server and account (Supabase URL
 *    + uid) and per data set (real or development sample), so a test upload
 *    to the local stack never blocks the real one to the remote project.
 *  - Online only. Nothing here deletes anything on the iPhone.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { NetworkError } from '../../lib/cloudRows';
import { isOffline } from '../../lib/connectivity';
import { supabase } from '../../lib/supabase';
import { syncError } from '../../lib/sync/errors';
import { toJpeg } from '../../utils/toJpeg';
import { Buckets, uploadFile } from '../cloud-storage.service';
import { findLegacyFile, type LegacySource } from './legacyDb';
import type { AudioItem, ImportPlan, MediaItem } from './plan';

// ── Where it went ────────────────────────────────────────────────────────

export interface ImportRecord {
  url: string;
  uid: string;
  dataset: 'real' | 'sample';
  profileIds: string[];
  status: 'partial' | 'verified';
  uploadedAt: string;
  verifiedAt: string | null;
  missing: MissingFile[];
}

export type ImportRecords = Record<string, ImportRecord>;

const RECORDS_KEY = 'studiply.legacyImport';

export function recordKey(url: string, uid: string, dataset: ImportRecord['dataset']): string {
  return `${url}|${uid}|${dataset}`;
}

export async function readRecords(): Promise<ImportRecords> {
  try {
    return JSON.parse((await AsyncStorage.getItem(RECORDS_KEY)) ?? '{}') as ImportRecords;
  } catch {
    return {};
  }
}

async function saveRecord(record: ImportRecord): Promise<void> {
  const records = await readRecords();
  records[recordKey(record.url, record.uid, record.dataset)] = record;
  await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

/**
 * The upload that stops this one: the same data, already sent to another
 * account on the same server (its ids exist there, so it would silently do
 * nothing). Another server, or another data set, never blocks.
 */
export function conflictingRecord(
  records: ImportRecords,
  target: { url: string; uid: string; dataset: ImportRecord['dataset']; profileIds: string[] },
): ImportRecord | null {
  return (
    Object.values(records).find(
      (r) =>
        r.url === target.url &&
        r.dataset === target.dataset &&
        r.uid !== target.uid &&
        r.profileIds.some((id) => target.profileIds.includes(id)),
    ) ?? null
  );
}

// ── Sending ──────────────────────────────────────────────────────────────

export interface MissingFile {
  kind: 'recording' | 'photo' | 'pdf';
  /** Its lecture; null for an old course upload (a library file now). */
  lectureId: string | null;
  id: string;
}

export interface ImportProgress {
  done: number;
  total: number;
  step: string;
}

const BATCH = 200;

function batches<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Table = 'courses' | 'folders' | 'files' | 'lectures' | 'summaries';

async function upsertRows(table: Table, rows: Record<string, unknown>[]): Promise<void> {
  for (const batch of batches(rows)) {
    const { error } = await supabase
      .from(table)
      .upsert(batch as never, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw syncError(error, `Could not upload ${table}.`);
  }
}

/** Ids among `ids` that the server already has. */
async function existingIds(table: Table | 'media', ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of batches(ids)) {
    const { data, error } = await supabase.from(table).select('id').in('id', batch);
    if (error) throw syncError(error, 'Could not check what is already uploaded.');
    for (const row of data ?? []) found.add((row as { id: string }).id);
  }
  return found;
}

async function existingAudio(lectureIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of batches([...new Set(lectureIds)])) {
    const { data, error } = await supabase
      .from('audio_chunks')
      .select('lecture_id, seq')
      .in('lecture_id', batch)
      .not('storage_path', 'is', null);
    if (error) throw syncError(error, 'Could not check what is already uploaded.');
    for (const c of data ?? []) found.add(`${c.lecture_id}#${c.seq}`);
  }
  return found;
}

async function lecturesWithSegments(lectureIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const id of lectureIds) {
    const { data, error } = await supabase.from('transcript_segments').select('id').eq('lecture_id', id).limit(1);
    if (error) throw syncError(error, 'Could not check what is already uploaded.');
    if ((data ?? []).length > 0) found.add(id);
  }
  return found;
}

async function sendAudio(source: LegacySource, a: AudioItem): Promise<boolean> {
  const uri = await findLegacyFile(source, a.file);
  if (!uri) return false;
  const { path } = await uploadFile({
    bucket: Buckets.audioChunks,
    path: `${a.lectureId}/${String(a.seq).padStart(4, '0')}.m4a`,
    uri,
    contentType: 'audio/m4a',
    upsert: true,
  });
  const { error } = await supabase.from('audio_chunks').upsert(
    {
      lecture_id: a.lectureId,
      seq: a.seq,
      start_ms: a.startMs,
      duration_ms: a.durationMs,
      storage_path: path,
      status: a.status,
    },
    { onConflict: 'lecture_id,seq' },
  );
  if (error) throw syncError(error, 'Could not upload a recording.');
  return true;
}

async function sendMedia(source: LegacySource, m: MediaItem): Promise<boolean> {
  const found = await findLegacyFile(source, m.file);
  if (!found) return false;
  const isPhoto = m.kind === 'photo';
  // The photos bucket only takes JPEG; old photos may be HEIC or PNG.
  const { uri, mimeType } = isPhoto ? await toJpeg(found) : { uri: found, mimeType: 'application/pdf' };
  const { path } = await uploadFile({
    bucket: isPhoto ? Buckets.photos : Buckets.slides,
    // Like the app's own: {lectureId}/… for a lecture's photo, {fileId}/… for a library file.
    path: `${m.fileId ?? m.lectureId}/${m.id}.${isPhoto ? 'jpg' : 'pdf'}`,
    uri,
    contentType: mimeType,
    upsert: true,
  });
  const { error } = await supabase.from('media').upsert(
    {
      id: m.id,
      lecture_id: m.lectureId,
      file_id: m.fileId,
      kind: m.kind,
      storage_path: path,
      mime_type: mimeType,
      size_bytes: isPhoto ? null : m.sizeBytes,
      caption: m.caption,
      created_at: m.createdAt,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw syncError(error, 'Could not upload a file.');
  return true;
}

/** Sends the plan. Throws on the first failure; running it again continues. */
export async function sendPlan(
  plan: ImportPlan,
  source: LegacySource,
  onProgress: (p: ImportProgress) => void = () => {},
): Promise<{ missing: MissingFile[] }> {
  if (isOffline()) throw new NetworkError();
  const total = 5 + plan.transcripts.length + plan.audio.length + plan.media.length;
  let done = 0;
  const tick = (step: string) => onProgress({ done: ++done, total, step });

  await upsertRows('courses', plan.courses);
  tick('Courses');
  // One at a time: a subfolder takes its course from its parent, which must exist first.
  for (const f of plan.folders) await upsertRows('folders', [f]);
  tick('Folders');
  await upsertRows('files', plan.files);
  tick('Lectures');
  await upsertRows('lectures', plan.lectures);
  tick('Lectures');
  await upsertRows('summaries', plan.summaries);
  tick('Notes');

  const withSegments = await lecturesWithSegments(plan.transcripts.map((t) => t.lectureId));
  for (const t of plan.transcripts) {
    if (!withSegments.has(t.lectureId)) {
      for (const batch of batches(t.segments, 500)) {
        const { error } = await supabase
          .from('transcript_segments')
          .insert(batch.map((s) => ({ ...s, lecture_id: t.lectureId })));
        if (error) throw syncError(error, 'Could not upload a transcript.');
      }
    }
    tick('Transcripts');
  }

  const missing: MissingFile[] = [];
  const audioDone = await existingAudio(plan.audio.map((a) => a.lectureId));
  for (const a of plan.audio) {
    if (!audioDone.has(`${a.lectureId}#${a.seq}`) && !(await sendAudio(source, a))) {
      missing.push({ kind: 'recording', lectureId: a.lectureId, id: `${a.lectureId}#${a.seq}` });
    }
    tick('Recordings');
  }

  const mediaDone = await existingIds('media', plan.media.map((m) => m.id));
  for (const m of plan.media) {
    if (!mediaDone.has(m.id) && !(await sendMedia(source, m))) {
      missing.push({ kind: m.kind === 'photo' ? 'photo' : 'pdf', lectureId: m.lectureId, id: m.id });
    }
    tick('Photos and PDFs');
  }
  return { missing };
}

// ── Checking ─────────────────────────────────────────────────────────────

export interface Verification {
  verified: boolean;
  /** What the server doesn't have yet, per kind. */
  notOnServer: Record<string, number>;
}

/** Asks the server for every expected row; files missing on the iPhone aren't expected. */
export async function verifyPlan(plan: ImportPlan, missing: MissingFile[]): Promise<Verification> {
  const notOnServer: Record<string, number> = {};
  const check = async (table: Table | 'media', ids: string[]) => {
    const found = await existingIds(table, ids);
    const lacking = ids.filter((id) => !found.has(id)).length;
    if (lacking > 0) notOnServer[table] = lacking;
  };
  const ids = (rows: Record<string, unknown>[]) => rows.map((r) => r.id as string);
  await check('courses', ids(plan.courses));
  await check('folders', ids(plan.folders));
  await check('files', ids(plan.files));
  await check('lectures', ids(plan.lectures));
  await check('summaries', ids(plan.summaries));

  const missingIds = new Set(missing.map((m) => m.id));
  await check('media', plan.media.map((m) => m.id).filter((id) => !missingIds.has(id)));
  const expectedAudio = plan.audio.map((a) => `${a.lectureId}#${a.seq}`).filter((id) => !missingIds.has(id));
  const audio = await existingAudio(plan.audio.map((a) => a.lectureId));
  const lackingAudio = expectedAudio.filter((id) => !audio.has(id)).length;
  if (lackingAudio > 0) notOnServer.audio_chunks = lackingAudio;

  const lackingTranscripts = plan.transcripts.length - (await lecturesWithSegments(plan.transcripts.map((t) => t.lectureId))).size;
  if (lackingTranscripts > 0) notOnServer.transcript_segments = lackingTranscripts;

  return { verified: Object.keys(notOnServer).length === 0, notOnServer };
}

// ── All together ─────────────────────────────────────────────────────────

export class ImportBlockedError extends Error {
  constructor() {
    super('This data was already uploaded to another account on this server.');
    this.name = 'ImportBlockedError';
  }
}

export async function runImport(params: {
  plan: ImportPlan;
  source: LegacySource;
  url: string;
  uid: string;
  profileIds: string[];
  onProgress?: (p: ImportProgress) => void;
}): Promise<ImportRecord> {
  const dataset = params.source.sample ? 'sample' : 'real';
  const target = { url: params.url, uid: params.uid, dataset, profileIds: params.profileIds } as const;
  if (conflictingRecord(await readRecords(), target)) throw new ImportBlockedError();

  const base: ImportRecord = {
    ...target,
    profileIds: [...params.profileIds],
    status: 'partial',
    uploadedAt: new Date().toISOString(),
    verifiedAt: null,
    missing: [],
  };
  // Remembered before sending: a half-done upload still belongs to this account.
  await saveRecord(base);
  const { missing } = await sendPlan(params.plan, params.source, params.onProgress);
  const check = await verifyPlan(params.plan, missing);
  const record: ImportRecord = {
    ...base,
    missing,
    status: check.verified ? 'verified' : 'partial',
    verifiedAt: check.verified ? new Date().toISOString() : null,
  };
  await saveRecord(record);
  return record;
}
