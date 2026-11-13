import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { RichText, useBridgeState, useEditorBridge } from '@10play/tentap-editor';

import { editorHtml } from '../../editor-web/build/editorHtml';
import { studiplyBridges } from './bridges';
import type { ExportBridgeInstance } from './bridges/export';
import { EMPTY_DOC } from './types';

export interface PdfRendererHandle {
  /** The print document of the tabs, laid out in pages by the editor bundle. */
  build: ExportBridgeInstance['buildPrint'];
  /** Formulas and graphs as PNGs for the Word export. */
  drawPictures: ExportBridgeInstance['drawPictures'];
  /** A Word file's page (mammoth's HTML) as a document. */
  importHtml: ExportBridgeInstance['importHtml'];
  /** A picture that can be transparent, drawn on white (PictureFlattenerHost). */
  flattenPicture: ExportBridgeInstance['flattenPicture'];
}

/**
 * The iPhone's PDF export: the editor bundle in a WebView of its
 * own, so the pages are laid out as the page view draws them, also from a
 * spreadsheet tab (which has no editor) and without touching the open one.
 * Mounted while "Preparing the PDF…" shows; a small view on screen (a
 * WebView off screen may not lay out or run its frames). The Word export
 * and import use it too: the pictures of formulas and graphs,
 * and a Word file's page read into a document.
 */
export const PdfRenderer = forwardRef<PdfRendererHandle>(function PdfRenderer(_props, ref) {
  const editor = useEditorBridge({ bridgeExtensions: studiplyBridges, customSource: editorHtml, initialContent: EMPTY_DOC, editable: false });
  const state = useBridgeState(editor);
  // Requests wait for the WebView to be ready.
  const ready = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  if (!ready.current) {
    let resolve = () => {};
    const promise = new Promise<void>((r) => (resolve = r));
    ready.current = { promise, resolve };
  }
  useEffect(() => {
    if (state.isReady) ready.current?.resolve();
  }, [state.isReady]);

  useImperativeHandle(
    ref,
    () => ({
      build: async (tabs, options, title) => {
        await ready.current?.promise;
        return (editor as unknown as ExportBridgeInstance).buildPrint(tabs, options, title);
      },
      drawPictures: async (requests) => {
        await ready.current?.promise;
        return (editor as unknown as ExportBridgeInstance).drawPictures(requests);
      },
      importHtml: async (html) => {
        await ready.current?.promise;
        return (editor as unknown as ExportBridgeInstance).importHtml(html);
      },
      flattenPicture: async (dataUrl) => {
        await ready.current?.promise;
        return (editor as unknown as ExportBridgeInstance).flattenPicture(dataUrl);
      },
    }),
    [editor],
  );

  return (
    <View style={styles.frame} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <RichText editor={editor} />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { width: 2, height: 2, opacity: 0.01, overflow: 'hidden' },
});
