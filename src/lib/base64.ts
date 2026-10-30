/**
 * Bytes to base64 and back, for files read and written through
 * expo-file-system's base64 strings (lib/m4aSplit's pieces). Plain JS: no
 * reliance on atob/btoa being there, no dependency.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUE = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUE[ALPHABET.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  const out: string[] = [];
  let line = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    line +=
      ALPHABET[(n >> 18) & 63] +
      ALPHABET[(n >> 12) & 63] +
      (i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? ALPHABET[n & 63] : '=');
    // Joined in pieces: one long `+=` string is slow on Hermes.
    if (line.length >= 8192) {
      out.push(line);
      line = '';
    }
  }
  out.push(line);
  return out.join('');
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let at = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = VALUE[clean.charCodeAt(i)];
    const b = VALUE[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? VALUE[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? VALUE[clean.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[at++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[at++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[at++] = n & 255;
  }
  return out.subarray(0, at);
}
