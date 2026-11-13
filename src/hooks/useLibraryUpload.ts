import { createElement, useCallback, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { showAlert } from '../components/dialogs/dialogs';
import { notifyLibraryUpdated } from '../lib/cache';
import { PdfRenderer, type PdfRendererHandle } from '../editor/PdfRenderer';
import type { DocJSON } from '../editor/types';
import { importDocx, importNote, isDocx, isOldWord, type WordPage } from '../services/docx-import.service';
import { uploadLibraryFile, type PickedFile } from '../services/library-upload.service';
import { trashSession } from '../services/trash.service';
import { errorMessage } from '../utils/errors';
import type { Place } from '../utils/moveRules';
import type { ShowUndo } from '../utils/star';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload: photos and PDFs picked, taken, dropped from the Finder
 * or pasted, added to a course or folder as files one after the other.
 * `progress` is "2 of 5" while it runs. Then one toast with Undo (which
 * moves them to the Trash), and one message for the files that couldn't be
 * added (with why).
 *
 * Word files become documents (docx-import.service), then a
 * note says what they had that isn't kept. On the iPhone their page is read
 * in the export WebView: `renderer` is that WebView while it is needed (the
 * screen puts it on screen).
 */
export function useLibraryUpload({ showUndo }: { showUndo: ShowUndo }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [reading, setReading] = useState(false);
  const renderer = useRef<PdfRendererHandle>(null);

  /** The iPhone's export WebView, put on screen and waited for. */
  const webView = useCallback(async (): Promise<PdfRendererHandle> => {
    setReading(true);
    for (let i = 0; i < 100; i++) {
      if (renderer.current) return renderer.current;
      await sleep(50);
    }
    throw new Error("This Word file can't be read. Please try again.");
  }, []);

  /** What a Word import needs a browser for: in the page on the laptop, in the WebView on the iPhone. */
  const page = useMemo<WordPage>(
    () => ({
      toDoc: async (html: string): Promise<DocJSON> => {
        if (Platform.OS === 'web') return (await import('../editor/export/wordImport')).wordHtmlToDoc(html);
        return (await webView()).importHtml(html);
      },
    }),
    [webView],
  );

  const upload = useCallback(
    async (place: Place, files: PickedFile[]) => {
      if (files.length === 0) return;
      setProgress({ done: 0, total: files.length });
      const added: { id: string; name: string | null }[] = [];
      const failed: { name: string; reason: string }[] = [];
      const imported: { title: string; notKept: string[] }[] = [];
      for (const file of files) {
        try {
          if (isDocx(file)) {
            const result = await importDocx(place, file, page);
            added.push({ id: result.fileId, name: file.name });
            imported.push(result);
          } else if (isOldWord(file)) {
            throw new Error('Old Word files (.doc) can’t be read. Save it as .docx in Word, then upload it again.');
          } else {
            added.push({ id: await uploadLibraryFile(place, file), name: file.name });
          }
        } catch (err) {
          failed.push({ name: file.name ?? 'A photo', reason: errorMessage(err, err instanceof Error ? err.message : 'Please try again.') });
        }
        setProgress((p) => p && { ...p, done: p.done + 1 });
      }
      setProgress(null);
      setReading(false);

      if (added.length > 0) {
        const what = added.length === 1 ? (added[0].name ? `'${added[0].name}'` : 'a photo') : `${added.length} files`;
        showUndo(`Added ${what} to ${place.label}`, () => {
          Promise.all(added.map((a) => trashSession(a.id)))
            .then(notifyLibraryUpdated)
            .catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
        });
      }
      if (failed.length > 0) {
        showAlert(
          failed.length === 1 ? `Could not add ${failed[0].name}` : `Could not add ${failed.length} files`,
          failed.length === 1 ? failed[0].reason : failed.map((f) => `${f.name}: ${f.reason}`).join('\n'),
        );
      }
      const note = importNote(imported);
      if (note) showAlert(note.title, note.message);
    },
    [showUndo, page],
  );

  /** The iPhone's export WebView while a Word file is read (the screen renders it). */
  const rendererView = reading && Platform.OS !== 'web' ? createElement(PdfRenderer, { ref: renderer }) : null;

  return { upload, progress, renderer: rendererView };
}
