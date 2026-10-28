/**
 * Where a document photo's picture comes from (step 4.5). A photo node's
 * `src` is `media:<media id>`: a stable reference to its `media` row, never
 * a link that expires. Each editor turns it into something an <img> can
 * show through a resolver:
 * - laptop: the app's own (a signed link to the photos bucket);
 * - iPhone WebView: asks native through the photo bridge, which answers
 *   later (`providePhoto`), with the photo itself from the phone when it has
 *   it, so photos show offline too.
 *
 * Shared by both editors, so it imports nothing from React Native.
 */

export const MEDIA_PREFIX = 'media:';

export const mediaSrc = (mediaId: string) => `${MEDIA_PREFIX}${mediaId}`;

/** The media id of a photo's `src`, or null for any other picture (a pasted link, a data URI). */
export function mediaIdOf(src: unknown): string | null {
  return typeof src === 'string' && src.startsWith(MEDIA_PREFIX) && src.length > MEDIA_PREFIX.length ? src.slice(MEDIA_PREFIX.length) : null;
}

/** Something to show, or why not: no connection (and no copy here), or no such photo. */
export type PhotoSource = { url: string } | { state: 'offline' | 'missing' };

/** Resolves a media id; null means the answer comes later through `providePhoto`. */
export type PhotoResolver = (mediaId: string) => Promise<PhotoSource | null>;

/** A photo that couldn't be shown is asked for again this often while it is on screen. */
export const RETRY_MS = 20_000;

let resolver: PhotoResolver | null = null;
const known = new Map<string, PhotoSource>();
const watchers = new Map<string, Set<(source: PhotoSource) => void>>();
const asking = new Set<string>();
const retries = new Map<string, ReturnType<typeof setTimeout>>();

async function ask(mediaId: string) {
  if (!resolver || asking.has(mediaId)) return;
  asking.add(mediaId);
  let source: PhotoSource | null;
  try {
    source = await resolver(mediaId);
  } catch {
    source = { state: 'offline' };
  }
  asking.delete(mediaId);
  if (source) providePhoto(mediaId, source);
}

/** Sets (or clears) how photos are resolved; photos already waiting are asked for. */
export function setPhotoResolver(next: PhotoResolver | null): void {
  resolver = next;
  if (next) for (const id of watchers.keys()) if (!hasUrl(known.get(id))) void ask(id);
}

const hasUrl = (source: PhotoSource | undefined): source is { url: string } => !!source && 'url' in source;

/**
 * What to show for a photo, from now on: the resolver's answer, or a photo
 * just added (shown from this device while it uploads).
 */
export function providePhoto(mediaId: string, source: PhotoSource): void {
  known.set(mediaId, source);
  watchers.get(mediaId)?.forEach((fn) => fn(source));
  clearTimeout(retries.get(mediaId));
  retries.delete(mediaId);
  if (!hasUrl(source)) {
    retries.set(
      mediaId,
      setTimeout(() => {
        retries.delete(mediaId);
        if (watchers.get(mediaId)?.size) void ask(mediaId);
      }, RETRY_MS),
    );
  }
}

/** Calls `fn` with the photo's source now (if known) and whenever it changes; returns the unsubscribe. */
export function watchPhoto(mediaId: string, fn: (source: PhotoSource) => void): () => void {
  let set = watchers.get(mediaId);
  if (!set) watchers.set(mediaId, (set = new Set()));
  set.add(fn);
  const current = known.get(mediaId);
  if (current) fn(current);
  if (!hasUrl(current)) void ask(mediaId);
  return () => {
    set.delete(fn);
    if (set.size === 0) watchers.delete(mediaId);
  };
}

/** Tests: forget everything. */
export function resetPhotoSources(): void {
  resolver = null;
  known.clear();
  watchers.clear();
  asking.clear();
  retries.forEach((t) => clearTimeout(t));
  retries.clear();
}
