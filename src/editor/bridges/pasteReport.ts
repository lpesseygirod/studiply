import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { countHtml, countSlice, pasteSource, type PasteReport } from '../pasteReport';

/**
 * The spike's paste report (step 4.2). Before a paste is applied it compares
 * the clipboard HTML with the slice ProseMirror made of it and keeps the
 * counts in the editor's storage; the laptop reads them on the next update,
 * the iPhone through the bridge state. Adds nothing to the schema.
 */

declare module '@tiptap/core' {
  interface Storage {
    pasteReport: { last: PasteReport | null };
  }
}

export const PasteReporter = Extension.create({
  name: 'pasteReport',

  addStorage() {
    return { last: null as PasteReport | null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage as { last: PasteReport | null };
    return [
      new Plugin({
        key: new PluginKey('pasteReport'),
        props: {
          handlePaste: (_view, event, slice) => {
            const html = event.clipboardData?.getData('text/html') ?? '';
            if (!html || typeof DOMParser === 'undefined') return false;
            const parsed = new DOMParser().parseFromString(html, 'text/html');
            storage.last = {
              id: (storage.last?.id ?? 0) + 1,
              source: pasteSource(html),
              had: countHtml(parsed.body),
              kept: countSlice(slice.content.toJSON() ?? []),
            };
            return false; // ProseMirror pastes as usual
          },
        },
      }),
    ];
  },
});

export type PasteReportState = { lastPaste: PasteReport | null };

export const PasteReportBridge = new BridgeExtension<PasteReportState>({
  tiptapExtension: PasteReporter,
  extendEditorState: (editor) => ({ lastPaste: editor.storage.pasteReport?.last ?? null }),
});
