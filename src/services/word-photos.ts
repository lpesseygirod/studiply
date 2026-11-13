import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import type { Picture, PhotoRequest } from '../editor/export/docxPictures';
import { mediaIdOf } from '../editor/media/photoSource';
import { editorPhotoSource } from './doc-photo.service';

/**
 * The iPhone's photos for the Word export: each photo as the
 * editor shows it (the phone's copy as a data URI, made from the signed link
 * the first time), a pasted picture's link downloaded, and its size. One
 * that can't be had is left out (null).
 */

const TYPES: Record<string, Picture['type']> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };

const sizeOf = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));

async function linkAsData(url: string): Promise<string | null> {
  const local = `${FileSystem.cacheDirectory}word-photo-${Date.now()}`;
  try {
    const result = await FileSystem.downloadAsync(url, local);
    if (result.status !== 200) return null;
    const mime = (result.headers['Content-Type'] ?? result.headers['content-type'] ?? 'image/jpeg').split(';')[0];
    return `data:${mime};base64,${await FileSystem.readAsStringAsync(local, { encoding: FileSystem.EncodingType.Base64 })}`;
  } finally {
    await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
  }
}

async function photoPicture(req: PhotoRequest): Promise<Picture | null> {
  let url = req.src;
  const mediaId = mediaIdOf(req.src);
  if (mediaId) {
    const source = await editorPhotoSource(mediaId);
    if (!('url' in source)) return null;
    url = source.url;
  }
  const data = url.startsWith('data:') ? url : await linkAsData(url);
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
