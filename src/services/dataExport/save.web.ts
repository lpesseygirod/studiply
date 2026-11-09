/**
 * save.web.ts
 * The laptop: each part of the export downloads as a .zip (a link the page clicks). The last
 * export is kept on `window.studiplyExport` for the Chrome check (export-data.mjs).
 */

declare global {
  interface Window {
    studiplyExport?: { files: { name: string; blob: Blob }[] };
  }
}

export const SAVE_OUTPUT = 'blob' as const;

export async function saveExportPart(name: string, data: Blob | Uint8Array, part: { index: number; total: number }): Promise<void> {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: 'application/zip' });
  if (part.index === 1) window.studiplyExport = { files: [] };
  window.studiplyExport?.files.push({ name, blob });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
