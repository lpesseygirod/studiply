/**
 * pendingFiles.web.ts
 * Web build of pendingFiles.ts: the browser uploads files when they are
 * added, so nothing is kept for later.
 */

export async function keepPendingFile(_lectureId: string, _name: string, uri: string, _copy = false): Promise<string> {
  return uri;
}

export async function pendingFileExists(_uri: string): Promise<boolean> {
  return true;
}

export async function removePendingFile(_uri: string): Promise<void> {}

export async function removeAllPendingFiles(): Promise<void> {}
