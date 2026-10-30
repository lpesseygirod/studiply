import React, { useEffect } from 'react';
import { EditorContent } from '@tiptap/react';
import { useTenTap } from '@10play/tentap-editor/src/web/useTenTap.tsx';
import { boot, sendMessage } from '@10play/tentap-editor/src/web/runtime.ts';

import { studiplyBridges } from '../src/editor/bridges';
import { PHOTO_NEED } from '../src/editor/bridges/photo';
import { buildPrint } from '../src/editor/export/printPages';
import { setPhotoResolver } from '../src/editor/media/photoSource';
import { PHOTO_CLASS } from '../src/editor/schema/photo';

declare global {
  interface Window {
    /** The editor, for the Chrome check (editor-spike.mjs), which runs this bundle without the app. */
    studiplyEditor?: ReturnType<typeof useTenTap>;
    /** The PDF export's pages (step 4.8a, the export bridge's), for the Chrome check (export.mjs). */
    studiplyBuildPrint?: typeof buildPrint;
  }
}

window.studiplyBuildPrint = buildPrint;

// Photos (`media:<id>`): native has them (the phone's copy, or a signed
// link) and answers through the photo bridge.
setPhotoResolver(async (mediaId) => {
  sendMessage({ type: PHOTO_NEED, payload: mediaId });
  return null;
});

/** How far a finger must drag the page before the keyboard closes. */
const DRAG_TO_CLOSE_PX = 12;

/** TenTap's editor with Studiply's bridges: the same schema as the laptop's. */
export default function Editor() {
  const editor = useTenTap({ bridges: studiplyBridges });
  const { dynamicHeight } = boot().requireConfig();
  window.studiplyEditor = editor;

  // Dragging the page (a scroll) closes the keyboard, as in Notes. Only a
  // finger that moved counts: a tap places the caret, and iOS's own scroll to
  // the caret sends no touches. A long press that turns into a text selection
  // is cancelled by iOS (touchcancel), so it doesn't close it either.
  useEffect(() => {
    if (!editor) return;
    let startY: number | null = null;
    const start = (e: TouchEvent) => {
      // Dragging a photo's corner handle resizes it; it isn't a scroll.
      const onHandle = (e.target as Element | null)?.closest?.(`.${PHOTO_CLASS}-handle`);
      startY = e.touches.length === 1 && !onHandle ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (startY === null || !editor.isFocused) return;
      if (Math.abs(e.touches[0].clientY - startY) > DRAG_TO_CLOSE_PX) {
        startY = null;
        editor.commands.blur();
      }
    };
    const end = () => {
      startY = null;
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, [editor]);

  return <EditorContent editor={editor} className={dynamicHeight ? 'tentap-root dynamic-height' : 'tentap-root'} />;
}
