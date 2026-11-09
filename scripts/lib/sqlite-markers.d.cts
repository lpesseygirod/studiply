// Types for sqlite-markers.cjs, for its Jest test.
export const SQLITE_TEXT_MARKERS: readonly [string, RegExp][];
export function sqliteHits(text: string): number;
export function isSqliteFile(relativePath: string): boolean;
