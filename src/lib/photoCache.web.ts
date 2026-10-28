/**
 * photoCache.web.ts
 * Web build of photoCache.ts: the browser shows photos from their signed
 * links (and caches them itself), so nothing is kept here.
 */

export async function cachedPhoto(_mediaId: string): Promise<string | null> {
  return null;
}

export async function keepPhoto(_mediaId: string, _from: string): Promise<void> {}

export async function downloadPhoto(_mediaId: string, _url: string): Promise<string | null> {
  return null;
}

export async function photoDataUri(uri: string): Promise<string> {
  return uri;
}

export async function removeAllCachedPhotos(): Promise<void> {}
