/**
 * legacyImport/index.ts
 * Step 1.9 for the screens: what the earlier version left on this iPhone,
 * uploading the chosen profiles, and removing the old copy afterwards.
 * See ./plan.ts (what becomes what), ./run.ts (sending, checking) and
 * ./legacyDb.ts (reading the old data; nothing on the web).
 */

import { supabaseUrl } from '../../lib/supabase';
import {
  legacyDataExists,
  legacyImportAvailable,
  legacySource,
  readLegacySnapshot,
  removeLegacyCopy,
  setUseSampleData,
  usesSampleData,
  type LegacySource,
} from './legacyDb';
import { planImport, summarizeProfiles, type LegacySnapshot, type ProfileSummary } from './plan';
import { conflictingRecord, readRecords, recordKey, runImport, type ImportProgress, type ImportRecord } from './run';

export { legacyDataExists, legacyImportAvailable, setUseSampleData, usesSampleData };
export type { ImportProgress, ImportRecord, ProfileSummary };
export { ImportBlockedError } from './run';

export interface EarlierVersion {
  source: LegacySource;
  snapshot: LegacySnapshot;
  profiles: ProfileSummary[];
  /** This server and account's upload of this data, if any. */
  record: ImportRecord | null;
  /** Another account on this server already has (some of) it. */
  uploadedElsewhere: boolean;
}

/** Null when this iPhone has no data from the earlier version (and always on the web). */
export async function loadEarlierVersion(uid: string): Promise<EarlierVersion | null> {
  if (!legacyImportAvailable) return null;
  const source = await legacySource();
  const snapshot = await readLegacySnapshot(source);
  if (!snapshot) return null;
  const dataset = source.sample ? 'sample' : 'real';
  const records = await readRecords();
  const profiles = summarizeProfiles(snapshot, new Date());
  return {
    source,
    snapshot,
    profiles,
    record: records[recordKey(supabaseUrl, uid, dataset)] ?? null,
    uploadedElsewhere: !!conflictingRecord(records, {
      url: supabaseUrl,
      uid,
      dataset,
      profileIds: profiles.map((p) => p.id),
    }),
  };
}

export function uploadEarlierVersion(params: {
  data: EarlierVersion;
  uid: string;
  profileIds: string[];
  onProgress?: (p: ImportProgress) => void;
}): Promise<ImportRecord> {
  const plan = planImport(params.data.snapshot, { profileIds: params.profileIds, now: new Date() });
  return runImport({
    plan,
    source: params.data.source,
    url: supabaseUrl,
    uid: params.uid,
    profileIds: params.profileIds,
    onProgress: params.onProgress,
  });
}

/** Only after a verified upload, when the student asks. */
export async function removeEarlierVersion(data: EarlierVersion): Promise<void> {
  if (data.record?.status !== 'verified') throw new Error('Upload and check everything first.');
  await removeLegacyCopy(data.source);
}

/** The Home card: old data found here and not yet uploaded and checked for this account. */
export async function shouldOfferEarlierVersion(uid: string): Promise<{ lectures: number; notes: number; courses: number } | null> {
  if (!legacyImportAvailable || !(await legacyDataExists())) return null;
  const data = await loadEarlierVersion(uid).catch(() => null);
  if (!data || data.record?.status === 'verified' || data.uploadedElsewhere) return null;
  const sum = (key: 'lectures' | 'notes' | 'courses') => data.profiles.reduce((n, p) => n + p[key], 0);
  return { courses: sum('courses'), lectures: sum('lectures'), notes: sum('notes') };
}
