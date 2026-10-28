import type { Editor } from '@tiptap/core';

import { showAlert } from '../components/dialogs/dialogs';
import { addDocPhoto } from '../services/doc-photo.service';
import { mediaSrc, providePhoto } from './media/photoSource';

/** An image file's size, so a large one is scaled down (toJpeg). */
function imageSize(url: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

/** A drop inside a line of text goes before or after that paragraph (the nearer end), not into the middle of it. */
export function blockBoundary(editor: Editor, pos: number): number {
  const $pos = editor.state.doc.resolve(Math.max(0, Math.min(pos, editor.state.doc.content.size)));
  if (!$pos.parent.isTextblock || $pos.depth === 0) return $pos.pos;
  return $pos.pos - $pos.start() <= $pos.end() - $pos.pos ? $pos.before() : $pos.after();
}

/**
 * The laptop's photos (step 4.5): image files picked with the toolbar's
 * Image button, dropped on the page or pasted go into the document where
 * the cursor (or the drop) is. Each shows at once from the browser while
 * it uploads; one that can't be uploaded is taken out again, and the
 * student is told why.
 */
export async function addPhotoFiles(editor: Editor, fileId: string, files: File[], at?: number): Promise<void> {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (images.length < files.length) showAlert('Only photos here', 'Images (JPEG, PNG, HEIC…) can go into a document; other files go in the library.');
  let pos = at === undefined ? undefined : blockBoundary(editor, at);
  for (const file of images) {
    const url = URL.createObjectURL(file);
    let src: string | null = null;
    try {
      await addDocPhoto(
        fileId,
        { uri: url, name: file.name, mimeType: file.type, sizeBytes: file.size, size: await imageSize(url) },
        {
          onReady: (mediaId, preview) => {
            src = mediaSrc(mediaId);
            providePhoto(mediaId, { url: preview });
            const node = { type: 'image', attrs: { src } };
            if (pos === undefined) editor.chain().focus().insertPhotos([src]).run();
            else editor.chain().focus().insertContentAt(pos, node).run();
            // The next one goes after it.
            pos = undefined;
          },
        },
      );
    } catch (err) {
      if (src) editor.commands.removePhotos(src);
      showAlert('Could not add the photo', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** The toolbar's Image button: the browser's file picker, photos only, several at once. */
export function pickPhotoFiles(editor: Editor, fileId: string): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  // In the page while the picker is open (Safari, and the browser's handing over of the files, need that).
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = () => {
    void addPhotoFiles(editor, fileId, Array.from(input.files ?? []));
    input.remove();
  };
  input.oncancel = () => input.remove();
  input.click();
}
