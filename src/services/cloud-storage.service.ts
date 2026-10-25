/**
 * cloud-storage.service.ts
 * Files in Supabase Storage: upload with progress and retries, signed URLs
 * to show private files, and removal.
 *
 * Not to be confused with storage.service.ts, which keeps copies of files on
 * this device. Buckets are private and every path starts with the owner's
 * user id (see supabase/migrations/…_storage.sql); this service adds that
 * prefix itself, so callers pass paths relative to the user's folder.
 *
 * Uploads go straight to the Storage REST endpoint (not supabase-js) because
 * supabase-js can't report upload progress. The request itself is sent by
 * lib/uploadTransport (iPhone: expo-file-system, web: XMLHttpRequest).
 */

import { isSimulatedOffline, reportFailure, reportReachable } from '../lib/connectivity';
import { anonKey, supabase, supabaseUrl } from '../lib/supabase';
import { sendFile } from '../lib/uploadTransport';
import { withRetries, type HttpResult } from '../lib/retry';

export const Buckets = {
  audioChunks: 'audio-chunks',
  slides: 'slides',
  photos: 'photos',
} as const;

export type Bucket = (typeof Buckets)[keyof typeof Buckets];

/** Size limits in MB, as set on the buckets (for error messages). */
const LIMIT_MB: Record<Bucket, number> = {
  'audio-chunks': 25,
  slides: 50,
  photos: 10,
};

const KIND: Record<Bucket, string> = {
  'audio-chunks': 'recording',
  slides: 'file',
  photos: 'photo',
};

/** An upload that failed; `message` is safe to show to the student. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface UploadOptions {
  bucket: Bucket;
  /** Path inside the user's folder, e.g. `profile/avatar-123.jpg`. */
  path: string;
  /** Local file URI (iPhone) or blob:/data: URI (web). */
  uri: string;
  contentType: string;
  /** Replace a file that already exists at this path. Default: false. */
  upsert?: boolean;
  /** Fraction sent, 0 to 1. Restarts from 0 on a retry. */
  onProgress?: (fraction: number) => void;
  /** Called before each retry, e.g. to show "Retrying (2/3)…". */
  onRetry?: (retry: number, maxRetries: number) => void;
}

// -------------------------------------------------------------------
// uploadFile
// Resolves with the full object path ({userId}/…), the value to store in
// the database.
// -------------------------------------------------------------------
export async function uploadFile({
  bucket,
  path,
  uri,
  contentType,
  upsert = false,
  onProgress,
  onRetry,
}: UploadOptions): Promise<{ path: string }> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new UploadError('You need to be signed in to upload files.', 401);

  const fullPath = `${userId}/${path.replace(/^\/+/, '')}`;
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${fullPath.split('/').map(encodeURIComponent).join('/')}`;

  if (isSimulatedOffline()) throw new UploadError('Could not upload. Check your connection and try again.', 0);

  let result: HttpResult;
  try {
    result = await withRetries(
      async () => {
        // A fresh token each time: a retry may come after a refresh.
        const { data: current } = await supabase.auth.getSession();
        const token = current.session?.access_token ?? '';
        onProgress?.(0);
        const answer = await sendFile(
          url,
          uri,
          {
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
            'Content-Type': contentType,
            'x-upsert': upsert ? 'true' : 'false',
          },
          onProgress,
        );
        return { status: storageStatus(answer), body: answer.body };
      },
      {
        refresh: async () => !(await supabase.auth.refreshSession()).error,
        onRetry,
      },
    );
  } catch {
    reportFailure();
    throw new UploadError('Could not upload. Check your connection and try again.', 0);
  }
  // Status 0: the transport gave up without an answer from the server.
  if (result.status > 0) reportReachable();
  else reportFailure();

  if (result.status < 200 || result.status >= 300) {
    throw new UploadError(errorMessage(result.status, bucket), result.status);
  }
  onProgress?.(1);
  return { path: fullPath };
}

// -------------------------------------------------------------------
// getSignedUrl
// A short-lived link to show a private file. Links are cached until five
// minutes before they expire, so images don't reload on every render.
// -------------------------------------------------------------------
const SIGNED_URL_SECONDS = 60 * 60;
const signedUrls = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedUrl(bucket: Bucket, path: string): Promise<string> {
  const key = `${bucket}/${path}`;
  const cached = signedUrls.get(key);
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached.url;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) throw new Error('Could not load the file.');

  signedUrls.set(key, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_SECONDS * 1000 });
  return data.signedUrl;
}

// -------------------------------------------------------------------
// removeFiles
// Takes full object paths, as returned by uploadFile.
// -------------------------------------------------------------------
export async function removeFiles(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw new Error('Could not delete the file.');
  for (const path of paths) signedUrls.delete(`${bucket}/${path}`);
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/**
 * Storage answers most errors with HTTP 400 and the real status in the JSON
 * body ({"statusCode": "413", "code": "EntityTooLarge", …}). An expired
 * token is reported as InvalidJWT and is treated as 401 so it gets refreshed.
 */
function storageStatus({ status, body }: HttpResult): number {
  if (status !== 400) return status;
  try {
    const parsed = JSON.parse(body) as { statusCode?: string; code?: string; message?: string };
    if (parsed.code === 'InvalidJWT' || /"exp" claim|jwt expired/i.test(parsed.message ?? '')) return 401;
    const inner = Number(parsed.statusCode);
    if (inner) return inner;
  } catch {
    // Not JSON: keep the HTTP status.
  }
  return status;
}

function errorMessage(status: number, bucket: Bucket): string {
  const kind = KIND[bucket];
  switch (status) {
    case 413:
      return `This ${kind} is too large (max ${LIMIT_MB[bucket]} MB).`;
    case 415:
      return `This type of ${kind} can't be uploaded.`;
    case 409:
      return `A ${kind} with this name already exists.`;
    case 401:
      return 'Your session has expired. Sign in again and retry.';
    case 403:
      return `You can't upload this ${kind} here.`;
    default:
      return status >= 500 || status === 408 || status === 429
        ? 'The server is busy. Try again in a moment.'
        : 'Could not upload. Try again.';
  }
}
