/**
 * A picture drawn on white (step 4.8b), in the editor bundle: the iPhone has
 * no canvas, so toJpeg sends a picture that can be transparent here (through
 * the export bridge, PictureFlattenerHost) before it becomes a JPEG, which has
 * no transparency (a transparent pixel would turn black). The laptop draws
 * on white in its own page (toJpeg.web.ts).
 */

/** The picture (a data URI) drawn on white at its own size, as a PNG data URI. */
export async function flattenOnWhite(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('The picture could not be read.'));
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, img.naturalWidth);
  canvas.height = Math.max(1, img.naturalHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The picture could not be read.');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}
