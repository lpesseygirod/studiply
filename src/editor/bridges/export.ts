import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { buildPrint, type PrintOptions, type PrintResult, type PrintTab } from '../export/printPages';

/**
 * The PDF export on the iPhone (step 4.8a), through TenTap's bridge: native
 * sends the tabs to the WebView (the PdfRenderer's, the editor bundle), the
 * WebView lays them out in pages as the laptop does (export/printPages.ts)
 * and answers with the print document, which expo-print turns into the PDF.
 */

export const EXPORT_BUILD = 'export-build';
export const EXPORT_DONE = 'export-done';

type BuildRequest = { id: string; tabs: PrintTab[]; options: PrintOptions; title: string };
type ExportMessage =
  | { type: typeof EXPORT_BUILD; payload: BuildRequest }
  | { type: typeof EXPORT_DONE; payload: { id: string; result?: PrintResult; error?: string } };

export type ExportBridgeInstance = {
  /** The print document of these tabs, made in the WebView. */
  buildPrint: (tabs: PrintTab[], options: PrintOptions, title: string) => Promise<PrintResult>;
};

/** Native: the requests waiting for their answer. */
const pending = new Map<string, { resolve: (r: PrintResult) => void; reject: (e: Error) => void }>();
let next = 0;

export const ExportBridge = new BridgeExtension<object, ExportBridgeInstance, ExportMessage>({
  forceName: 'studiplyExport',
  onBridgeMessage: (_editor, message, sendMessageBack) => {
    if (message.type !== EXPORT_BUILD) return false;
    const { id, tabs, options, title } = message.payload;
    buildPrint(tabs, options, title).then(
      (result) => sendMessageBack({ type: EXPORT_DONE, payload: { id, result } }),
      (err: unknown) => sendMessageBack({ type: EXPORT_DONE, payload: { id, error: err instanceof Error ? err.message : String(err) } }),
    );
    return true;
  },
  onEditorMessage: (message) => {
    if (message.type !== EXPORT_DONE) return false;
    const waiting = pending.get(message.payload.id);
    pending.delete(message.payload.id);
    if (message.payload.result) waiting?.resolve(message.payload.result);
    else waiting?.reject(new Error(message.payload.error ?? 'Could not make the PDF.'));
    return true;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    buildPrint: (tabs, options, title) =>
      new Promise<PrintResult>((resolve, reject) => {
        next += 1;
        const id = `export-${next}`;
        pending.set(id, { resolve, reject });
        sendBridgeMessage({ type: EXPORT_BUILD, payload: { id, tabs, options, title } });
      }),
  }),
  extendEditorState: () => ({}),
});
