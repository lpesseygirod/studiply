import type { Picture, PhotoRequest } from '../editor/export/docxPictures';
import { mediaIdOf } from '../editor/media/photoSource';
import { editorPhotoSource } from './doc-photo.service';

/**
 * The laptop's photos for the Word export (step 4.8b): each photo's file
 * (its signed link, or the data URI a pasted picture has) and its size.
 * One that can't be had is left out (null).
 */

const TYPES: Record<string, Picture['type']> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const sizeOf = (url: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('The photo could not be read.'));
    img.src = url;
  });

async function photoPicture(req: PhotoRequest): Promise<Picture | null> {
  let url = req.src;
  const mediaId = mediaIdOf(req.src);
  if (mediaId) {
    const source = await editorPhotoSource(mediaId);
    if (!('url' in source)) return null;
    url = source.url;
  }
  const data = url.startsWith('data:') ? url : await fetch(url).then(async (res) => (res.ok ? asDataUrl(await res.blob()) : null));
  if (!data) return null;
  const mime = /^data:([^;,]+)/.exec(data)?.[1]?.toLowerCase() ?? '';
  const type = TYPES[mime];
  if (!type) return null;
  const size = await sizeOf(data);
  return { id: req.id, type, data: data.replace(/^data:[^,]*,/, ''), width: size.width, height: size.height };
}

export async function loadWordPhotos(requests: PhotoRequest[]): Promise<{ pictures: Picture[]; failed: string[] }> {
  const pictures: Picture[] = [];
  const failed: string[] = [];
  for (const req of requests) {
    const picture = await photoPicture(req).catch(() => null);
    if (picture) pictures.push(picture);
    else failed.push(req.id);
  }
  return { pictures, failed };
}
