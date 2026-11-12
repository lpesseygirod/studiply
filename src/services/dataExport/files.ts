/**
 * files.ts
 * Small helpers for "Export my data": safe file and folder names, CSV, times.
 */

/** A name that works as a file or folder name on every system (no / \ : * ? " < > |, ≤ 80 characters). */
export function safeName(name: string | null | undefined, fallback: string): string {
  const cleaned = (name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
}

/** Hands out names unique within one folder: "Tema 1", "Tema 1 (2)", case-insensitively. */
export class NameSpace {
  private taken = new Set<string>();

  take(name: string, ext = ''): string {
    let candidate = `${name}${ext}`;
    for (let n = 2; this.taken.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})${ext}`;
    this.taken.add(candidate.toLowerCase());
    return candidate;
  }
}

/** RFC 4180 CSV: every field quoted when needed, CRLF line ends, a header row first. */
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const field = (v: string | number | boolean | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(field).join(',')).join('\r\n') + '\r\n';
}

/** 400000 ms → "06:40"; past an hour "1:04:12". */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** The extension of a stored file ("webm", "jpg", "pdf"), or ''. */
export function extensionOf(path: string | null | undefined): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(path ?? '');
  return m ? m[1].toLowerCase() : '';
}

/** "1.2 GB", "380 MB", "12 KB". */
export function sizeText(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
