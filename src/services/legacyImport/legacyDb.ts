/**
 * legacyDb.ts
 * Reads the earlier version's data on this iPhone for the import: the old
 * database and its files under documents/source-files/. Read-only; only
 * removeLegacyCopy deletes, when the student asks after a verified upload.
 *
 * In development a sample copy (own database file and folder) can stand in
 * for the real data, so testing never reads, uploads or removes it.
 * The web build uses legacyDb.web.ts: a browser has no earlier-version data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { all, databaseFileUri, DB_NAME, resetDb, SAMPLE_DB_NAME } from '../../lib/db';
import type { FileCandidates, LegacySnapshot } from './plan';

export const legacyImportAvailable = true;

const SAMPLE_KEY = 'studiply.dev.legacySample';

export interface LegacySource {
  dbName: string;
  /** Where the old app kept its copies: source-files/{userId}/{sessionId}/{name}. */
  filesRoot: string;
  sample: boolean;
}

export async function usesSampleData(): Promise<boolean> {
  return __DEV__ && (await AsyncStorage.getItem(SAMPLE_KEY).catch(() => null)) === '1';
}

/** Development only: read the sample instead of the real earlier-version data. */
export async function setUseSampleData(on: boolean): Promise<void> {
  if (!__DEV__) return;
  if (on) await AsyncStorage.setItem(SAMPLE_KEY, '1');
  else await AsyncStorage.removeItem(SAMPLE_KEY);
}

export async function legacySource(): Promise<LegacySource> {
  const docs = FileSystem.documentDirectory ?? '';
  return (await usesSampleData())
    ? { dbName: SAMPLE_DB_NAME, filesRoot: `${docs}legacy-sample/source-files/`, sample: true }
    : { dbName: DB_NAME, filesRoot: `${docs}source-files/`, sample: false };
}

async function exists(uri: string): Promise<boolean> {
  return (await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }))).exists;
}

/** The old data, or null when this iPhone has none. Never creates the database. */
export async function readLegacySnapshot(source: LegacySource): Promise<LegacySnapshot | null> {
  if (!(await exists(databaseFileUri(source.dbName)))) return null;
  const read = <T>(table: string) => all<T>(`SELECT * FROM ${table}`, [], source.dbName);
  const [profiles, projects, folders, sessions, sourceFiles, transcripts, notes] = await Promise.all([
    read<LegacySnapshot['profiles'][number]>('profiles'),
    read<LegacySnapshot['projects'][number]>('projects'),
    read<LegacySnapshot['folders'][number]>('folders'),
    read<LegacySnapshot['sessions'][number]>('sessions'),
    read<LegacySnapshot['sourceFiles'][number]>('source_files'),
    read<LegacySnapshot['transcripts'][number]>('transcripts'),
    read<LegacySnapshot['notes'][number]>('notes'),
  ]);
  if (profiles.length === 0) return null;
  return { profiles, projects, folders, sessions, sourceFiles, transcripts, notes };
}

/**
 * Where an old file is now: the app's own copy first (rebuilt from today's
 * documents folder, since absolute paths change between installs), then
 * the URI it was picked or recorded at. Null when neither exists.
 */
export async function findLegacyFile(source: LegacySource, file: FileCandidates): Promise<string | null> {
  if (file.storagePath) {
    const copy = source.filesRoot + file.storagePath.replace(/^\/+/, '');
    if (await exists(copy)) return copy;
  }
  if (file.filePath && (await exists(file.filePath))) return file.filePath;
  return null;
}

/** "Remove the old copy from this iPhone": the old database and its files. */
export async function removeLegacyCopy(source: LegacySource): Promise<void> {
  await resetDb(source.dbName);
  await FileSystem.deleteAsync(source.filesRoot, { idempotent: true });
}

export async function legacyDataExists(): Promise<boolean> {
  return exists(databaseFileUri((await legacySource()).dbName));
}
