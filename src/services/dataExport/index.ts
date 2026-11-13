/**
 * dataExport — "Export my data" (D4: Settings → Account and Settings → Your data;
 * D6: one ZIP built on this device).
 *
 *   prepareExport()  reads every row of hers (as her: the app's own client, so RLS gives only her
 *                    rows; never the service role) and the list of her stored files, and plans the
 *                    ZIP (./plan.ts): its size and parts of at most 500 MB (./parts.ts).
 *   runExport()      builds each part (./build.ts), fetching her files through signed links, and
 *                    saves it: a download on the laptop, the share sheet on the iPhone (./save).
 *
 * Nothing leaves the device except the download or share she starts. No AI call. It needs a
 * connection (her files are on Studiply). Cancel stops it. No logs of names or content.
 */

import { supabase } from '../../lib/supabase';
import { NetworkError, serviceError } from '../../lib/cloudRows';
import { isOffline } from '../../lib/connectivity';
import { getSignedUrl } from '../cloud-storage.service';
import { getUserSettings } from '../settings.service';
import { buildPart, ExportCancelled, type ExportProgress } from './build';
import { exportSize, partFileName, splitParts, type ExportPart } from './parts';
import { EXPORT_TABLES, planExport, type ExportBucket, type ExportPlan, type ExportSnapshot, type ExportTable, type ExportTables } from './plan';
import { saveExportPart, SAVE_OUTPUT } from './save';

export { ExportCancelled, progressLine, type ExportProgress } from './build';

export const EXPORT_OFFLINE_MESSAGE = 'Exporting your data needs a connection.';

const PAGE = 1000;
const BUCKETS: ExportBucket[] = ['audio-chunks', 'photos', 'slides'];
const ORDER_KEY: Partial<Record<ExportTable, string>> = { course_settings: 'course_id' };

export interface PreparedExport {
  plan: ExportPlan;
  parts: ExportPart[];
  exportedAt: string;
  size: { total: number; recordings: number };
}

function checkOnline() {
  if (isOffline()) throw new NetworkError(EXPORT_OFFLINE_MESSAGE);
}

async function readTable<K extends ExportTable>(table: K, signal: AbortSignal): Promise<ExportTables[K]> {
  const rows: ExportTables[K] = [] as unknown as ExportTables[K];
  for (let from = 0; ; from += PAGE) {
    if (signal.aborted) throw new ExportCancelled();
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(ORDER_KEY[table] ?? 'id')
      .range(from, from + PAGE - 1);
    if (error) throw serviceError(error, 'Your data couldn’t be read.');
    (rows as unknown[]).push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Her stored files under {userId}/ in a bucket, path → size (the folders walked). */
async function listSizes(bucket: ExportBucket, userId: string, signal: AbortSignal): Promise<Record<string, number>> {
  const sizes: Record<string, number> = {};
  const walk = async (prefix: string, depth: number): Promise<void> => {
    for (let offset = 0; ; offset += PAGE) {
      if (signal.aborted) throw new ExportCancelled();
      const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset });
      if (error) throw serviceError({ message: error.message }, 'Your files couldn’t be listed.');
      for (const item of data ?? []) {
        const path = `${prefix}/${item.name}`;
        if (item.id === null) {
          if (depth < 6) await walk(path, depth + 1);
        } else {
          sizes[path] = Number((item.metadata as { size?: number } | null)?.size ?? 0);
        }
      }
      if (!data || data.length < PAGE) return;
    }
  };
  await walk(userId, 0);
  return sizes;
}

export async function prepareExport(signal: AbortSignal): Promise<PreparedExport> {
  checkOnline();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) throw new Error('Sign in again to export your data.');

  const tables = {} as ExportTables;
  for (const table of EXPORT_TABLES) {
    (tables as Record<ExportTable, unknown>)[table] = await readTable(table, signal);
  }
  const sizes = {} as ExportSnapshot['sizes'];
  for (const bucket of BUCKETS) sizes[bucket] = await listSizes(bucket, user.id, signal);
  const settings = await getUserSettings(user.id).catch(() => null);

  const exportedAt = new Date().toISOString();
  const plan = planExport({
    exportedAt,
    userId: user.id,
    email: user.email ?? null,
    deviceSettings: (settings ?? {}) as Record<string, unknown>,
    tables,
    sizes,
  });
  return { plan, parts: splitParts(plan), exportedAt, size: exportSize(plan) };
}

async function fetchFile(file: { bucket: ExportBucket; storagePath: string }, signal: AbortSignal): Promise<Uint8Array> {
  checkOnline();
  const url = await getSignedUrl(file.bucket, file.storagePath);
  const res = await fetch(url, { signal }).catch((err: unknown) => {
    if (signal.aborted) throw new ExportCancelled();
    throw err;
  });
  if (!res.ok) throw new Error('A file couldn’t be downloaded. Please try again.');
  return new Uint8Array(await res.arrayBuffer());
}

/** Builds and saves every part in turn; returns the saved files' names. */
export async function runExport(
  prepared: PreparedExport,
  options: { signal: AbortSignal; onProgress?: (p: ExportProgress) => void },
): Promise<string[]> {
  const { signal, onProgress } = options;
  const names: string[] = [];
  const total = prepared.parts.length;
  for (const part of prepared.parts) {
    const data = await buildPart(part, { parts: total, fetchFile, signal, onProgress, output: SAVE_OUTPUT });
    if (signal.aborted) throw new ExportCancelled();
    onProgress?.({ part: part.index, parts: total, stage: 'saving', done: 0, total: 1 });
    const name = partFileName(prepared.exportedAt, part.index, total);
    await saveExportPart(name, data, { index: part.index, total });
    names.push(name);
  }
  return names;
}
