import { isHeifBytes, isHeifType } from './heif';

/** Longest side after conversion; enough for board photos sent to Claude later. */
const MAX_SIDE = 2048;
const UNREADABLE = "This image can't be read.";

// -------------------------------------------------------------------
// toJpeg (laptop)
// Re-encodes any picked, pasted or dropped image as JPEG, scaled down so its
// longest side is at most 2048 px, drawn on white: a JPEG has no
// transparency, and a browser saves a transparent pixel as black, so a
// transparent PNG logo would otherwise come out in a black box. Returns a
// blob: URI. `size` is not needed: the browser reads the picture's own.
//
// HEIC / HEIF (Lea, 6 Nov): the browser can't draw them, so when <img> fails
// on one (its type or its bytes say so) it is decoded with libheif-js (LGPL-3.0),
// loaded only then (a dynamic import of its bundled build, the WebAssembly
// inside it); the first picture of a file with several is used. Then the same
// size and white-background rules.
// -------------------------------------------------------------------
export async function toJpeg(uri: string, _size?: { width: number; height: number }): Promise<{ uri: string; mimeType: 'image/jpeg' }> {
  const picture = await loadImage(uri).catch(async () => {
    const decoded = await decodeHeif(uri).catch(() => null);
    if (!decoded) throw new Error(UNREADABLE);
    return decoded;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(picture.width, picture.height, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(picture.width * scale));
  canvas.height = Math.max(1, Math.round(picture.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(UNREADABLE);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(picture.source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!blob) throw new Error(UNREADABLE);
  return { uri: URL.createObjectURL(blob), mimeType: 'image/jpeg' };
}

interface Picture {
  source: CanvasImageSource;
  width: number;
  height: number;
}

function loadImage(uri: string): Promise<Picture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(UNREADABLE));
    img.src = uri;
  });
}

/** A HEIC / HEIF file's first picture on a canvas, or null when it isn't one. */
async function decodeHeif(uri: string): Promise<Picture | null> {
  const blob = await (await fetch(uri)).blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isHeifType(blob.type) && !isHeifBytes(bytes)) return null;
  const libheif = await loadLibheif();
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(bytes);
  const image = images[0];
  if (!image) return null;
  try {
    const width = image.get_width();
    const height = image.get_height();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const data = ctx.createImageData(width, height);
    await new Promise<void>((resolve, reject) => image.display(data, (shown) => (shown ? resolve() : reject(new Error(UNREADABLE)))));
    ctx.putImageData(data, 0, 0);
    return { source: canvas, width, height };
  } finally {
    for (const each of images) each.free?.();
  }
}

type Libheif = typeof import('libheif-js/wasm-bundle');
let libheifLoading: Promise<Libheif> | null = null;

/** libheif-js, loaded the first time a HEIC is met (never on the iPhone: this file is the web's). */
function loadLibheif(): Promise<Libheif> {
  libheifLoading ??= import('libheif-js/wasm-bundle').then((m) => ((m as { default?: Libheif }).default ?? m) as Libheif);
  return libheifLoading;
}
