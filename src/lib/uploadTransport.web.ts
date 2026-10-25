/**
 * uploadTransport.web.ts
 * Web version of uploadTransport.ts. Pickers on web return blob: or data:
 * URIs, which are read into a Blob and sent with XMLHttpRequest, because
 * fetch() can't report upload progress.
 */

import type { HttpResult } from './retry';

/** Rejects only when the request never reached the server (offline, timeout). */
export async function sendFile(
  url: string,
  uri: string,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
): Promise<HttpResult> {
  const blob = await (await fetch(uri)).blob();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error('No connection.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out.'));
    xhr.onabort = () => reject(new Error('The upload was cancelled.'));
    xhr.send(blob);
  });
}
