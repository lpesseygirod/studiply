/**
 * uploadTransport.ts (iPhone)
 * Sends one file from disk as the raw request body and reports progress.
 * Web uses uploadTransport.web.ts.
 */

import * as FileSystem from 'expo-file-system/legacy';

import type { HttpResult } from './retry';

/** Rejects only when the request never reached the server (offline, timeout). */
export async function sendFile(
  url: string,
  uri: string,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
): Promise<HttpResult> {
  const task = FileSystem.createUploadTask(
    url,
    uri,
    { httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      if (totalBytesExpectedToSend > 0) onProgress?.(totalBytesSent / totalBytesExpectedToSend);
    },
  );
  const result = await task.uploadAsync();
  if (!result) throw new Error('The upload was cancelled.');
  return { status: result.status, body: result.body };
}
