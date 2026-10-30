/** Longest side after conversion; enough for board photos sent to Claude later. */
const MAX_SIDE = 2048;

// -------------------------------------------------------------------
// toJpeg (laptop)
// Re-encodes any picked, pasted or dropped image as JPEG, scaled down so its
// longest side is at most 2048 px, drawn on white (step 4.8b): a JPEG has no
// transparency, and a browser saves a transparent pixel as black, so a
// transparent PNG logo would otherwise come out in a black box. Returns a
// blob: URI. `size` is not needed: the browser reads the picture's own.
// -------------------------------------------------------------------
export async function toJpeg(uri: string, _size?: { width: number; height: number }): Promise<{ uri: string; mimeType: 'image/jpeg' }> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("This image can't be read."));
    img.src = uri;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("This image can't be read.");
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!blob) throw new Error("This image can't be read.");
  return { uri: URL.createObjectURL(blob), mimeType: 'image/jpeg' };
}
