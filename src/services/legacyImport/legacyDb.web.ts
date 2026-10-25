/**
 * legacyDb.web.ts
 * Web build of legacyDb.ts: a browser never had the earlier version's
 * on-device data, so there is nothing to read or upload.
 */

import type { FileCandidates, LegacySnapshot } from './plan';

export const legacyImportAvailable = false;

export interface LegacySource {
  dbName: string;
  filesRoot: string;
  sample: boolean;
}

export async function usesSampleData(): Promise<boolean> {
  return false;
}

export async function setUseSampleData(_on: boolean): Promise<void> {}

export async function legacySource(): Promise<LegacySource> {
  return { dbName: '', filesRoot: '', sample: false };
}

export async function readLegacySnapshot(_source: LegacySource): Promise<LegacySnapshot | null> {
  return null;
}

export async function findLegacyFile(_source: LegacySource, _file: FileCandidates): Promise<string | null> {
  return null;
}

export async function removeLegacyCopy(_source: LegacySource): Promise<void> {}

export async function legacyDataExists(): Promise<boolean> {
  return false;
}
