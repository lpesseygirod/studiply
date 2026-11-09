/**
 * purge.ts
 * The nightly trash clean-up's rules (purge-trash), kept pure.
 */

/** Items stay in the trash this long (the app says so: "30 days left"). */
export const RETENTION_DAYS = 30;
/** Storage paths per remove request. */
export const REMOVE_BATCH = 100;

export function cutoffFor(now: Date): string {
  return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** The lectures in audio_purge_plan's rows, each once (a lecture with no file left has a null path). */
export function dueLectures(plan: { lecture_id: string }[]): string[] {
  return [...new Set(plan.map((r) => r.lecture_id).filter(Boolean))];
}

/** The plan's objects per bucket, each path once, in batches for the Storage API. */
export function removalBatches(plan: { bucket: string; path: string | null }[]): { bucket: string; paths: string[] }[] {
  const byBucket = new Map<string, Set<string>>();
  for (const { bucket, path } of plan) {
    if (!path) continue;
    byBucket.set(bucket, (byBucket.get(bucket) ?? new Set()).add(path));
  }
  const out: { bucket: string; paths: string[] }[] = [];
  for (const [bucket, set] of byBucket) {
    const paths = [...set];
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) out.push({ bucket, paths: paths.slice(i, i + REMOVE_BATCH) });
  }
  return out;
}

/** Compares the caller's secret without leaking where it differs. */
export function sameSecret(given: string, expected: string): boolean {
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
