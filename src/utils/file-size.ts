import * as FileSystem from 'expo-file-system/legacy';

// -------------------------------------------------------------------
// formatFileSize
// Converts a byte count to a human-readable string.
// -------------------------------------------------------------------
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// -------------------------------------------------------------------
// getLocalFileSize
// Returns the byte size of a local file URI, or null on failure.
// -------------------------------------------------------------------
export async function getLocalFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory) {
      return (info as FileSystem.FileInfo & { size?: number }).size ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
