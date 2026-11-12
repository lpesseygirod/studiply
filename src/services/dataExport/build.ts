/**
 * build.ts
 * One part of "Export my data" as a ZIP (jszip, already a dependency). Text is
 * compressed; recordings, photos and PDFs are stored as they are (already compressed, and faster).
 * Files come through `fetchFile` (her signed links in the app; fixtures in the tests). Cancel stops
 * between files and during the packing; nothing is saved then.
 */

import JSZip from 'jszip';

import type { ExportPart } from './parts';
import type { PlannedFile } from './plan';

export class ExportCancelled extends Error {
  constructor() {
    super('The export was cancelled.');
    this.name = 'ExportCancelled';
  }
}

export interface ExportProgress {
  part: number;
  parts: number;
  stage: 'reading' | 'files' | 'zip' | 'saving';
  done: number;
  total: number;
}

/** "Reading your library…", "Part 2 of 3 · Copying your files: 12 of 40", "Making the ZIP: 45%". */
export function progressLine(p: ExportProgress): string {
  const prefix = p.parts > 1 ? `Part ${p.part} of ${p.parts} · ` : '';
  switch (p.stage) {
    case 'reading':
      return 'Reading your library…';
    case 'files':
      return `${prefix}Copying your files: ${p.done} of ${p.total}`;
    case 'zip':
      return `${prefix}Making the ZIP: ${p.done}%`;
    default:
      return `${prefix}Saving…`;
  }
}

export interface BuildOptions<T extends 'blob' | 'uint8array'> {
  parts: number;
  fetchFile: (file: PlannedFile, signal: AbortSignal) => Promise<Uint8Array>;
  signal: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
  output: T;
}

export async function buildPart<T extends 'blob' | 'uint8array'>(
  part: ExportPart,
  options: BuildOptions<T>,
): Promise<T extends 'blob' ? Blob : Uint8Array> {
  const { signal, onProgress, parts } = options;
  const check = () => {
    if (signal.aborted) throw new ExportCancelled();
  };
  const zip = new JSZip();
  for (const t of part.texts) zip.file(t.path, t.text, { compression: 'DEFLATE' });

  const total = part.files.length;
  for (let i = 0; i < total; i++) {
    check();
    onProgress?.({ part: part.index, parts, stage: 'files', done: i, total });
    const file = part.files[i];
    const data = await options.fetchFile(file, signal);
    check();
    zip.file(file.path, data, { binary: true, compression: 'STORE' });
  }
  check();
  onProgress?.({ part: part.index, parts, stage: 'zip', done: 0, total: 100 });
  const result = await zip.generateAsync({ type: options.output, compression: 'DEFLATE', compressionOptions: { level: 6 } }, (meta) => {
    // jszip can't be stopped mid-way; a Cancel during packing throws as soon as it reports.
    if (signal.aborted) throw new ExportCancelled();
    onProgress?.({ part: part.index, parts, stage: 'zip', done: Math.round(meta.percent), total: 100 });
  });
  check();
  return result as T extends 'blob' ? Blob : Uint8Array;
}
