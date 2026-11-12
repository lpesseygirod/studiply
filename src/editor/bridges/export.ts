import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { buildPrint, type PrintOptions, type PrintResult, type PrintTab } from '../export/printPages';
import type { DrawRequest, Picture } from '../export/docxPictures';
import { makePictures } from '../export/pictures';
import { wordHtmlToDoc } from '../export/wordImport';
import { flattenOnWhite } from '../export/flatten';
import type { DocJSON } from '../types';

/**
 * Export and import on the iPhone, through TenTap's bridge: native sends a
 * request to the WebView (the PdfRenderer's, the editor bundle), which does
 * what needs a browser and answers.
 * - PDF: the tabs laid out in pages as the laptop does
 *   (export/printPages.ts); expo-print turns the print document into the PDF.
 * - Word: the formulas and graphs drawn as PNGs
 *   (export/pictures.ts) for the .docx the app builds, and a Word file's page
 *   (mammoth's HTML) read into a document (export/wordImport.ts).
 * - Any photo that can be transparent, drawn on white before it becomes a
 *   JPEG (export/flatten.ts; utils/toJpeg through PictureFlattenerHost).
 */

export const EXPORT_BUILD = 'export-build';
export const EXPORT_DONE = 'export-done';

type PrintRequest = { id: string; op?: 'print'; tabs: PrintTab[]; options: PrintOptions; title: string };
type PicturesRequest = { id: string; op: 'pictures'; requests: DrawRequest[] };
type ImportRequest = { id: string; op: 'import'; html: string };
type FlattenRequest = { id: string; op: 'flatten'; dataUrl: string };
type ExportRequest = PrintRequest | PicturesRequest | ImportRequest | FlattenRequest;

/** `reasons`: why each failed one failed (never the formula itself). */
export type DrawnPictures = { pictures: Picture[]; failed: string[]; reasons?: string[] };
type ExportMessage =
  | { type: typeof EXPORT_BUILD; payload: ExportRequest }
  | { type: typeof EXPORT_DONE; payload: { id: string; result?: unknown; error?: string } };

export type ExportBridgeInstance = {
  /** The print document of these tabs, made in the WebView. */
  buildPrint: (tabs: PrintTab[], options: PrintOptions, title: string) => Promise<PrintResult>;
  /** Formulas and graphs as PNGs, drawn in the WebView. */
  drawPictures: (requests: DrawRequest[]) => Promise<DrawnPictures>;
  /** A Word page's HTML (mammoth's) as a document, read in the WebView. */
  importHtml: (html: string) => Promise<DocJSON>;
  /** A picture (a data URI) drawn on white, as a PNG data URI. */
  flattenPicture: (dataUrl: string) => Promise<string>;
};

/** WebView: does what the request asks. */
async function run(request: ExportRequest): Promise<unknown> {
  if (request.op === 'pictures') return makePictures(request.requests);
  if (request.op === 'import') return wordHtmlToDoc(request.html);
  if (request.op === 'flatten') return flattenOnWhite(request.dataUrl);
  return buildPrint(request.tabs, request.options, request.title);
}

/** Native: the requests waiting for their answer. */
const pending = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
let next = 0;

export const ExportBridge = new BridgeExtension<object, ExportBridgeInstance, ExportMessage>({
  forceName: 'studiplyExport',
  onBridgeMessage: (_editor, message, sendMessageBack) => {
    if (message.type !== EXPORT_BUILD) return false;
    const { id } = message.payload;
    run(message.payload).then(
      (result) => sendMessageBack({ type: EXPORT_DONE, payload: { id, result } }),
      (err: unknown) => sendMessageBack({ type: EXPORT_DONE, payload: { id, error: err instanceof Error ? err.message : String(err) } }),
    );
    return true;
  },
  onEditorMessage: (message) => {
    if (message.type !== EXPORT_DONE) return false;
    const waiting = pending.get(message.payload.id);
    pending.delete(message.payload.id);
    if (message.payload.result !== undefined) waiting?.resolve(message.payload.result);
    else waiting?.reject(new Error(message.payload.error ?? 'Could not make the file.'));
    return true;
  },
  extendEditorInstance: (sendBridgeMessage) => {
    const ask = <T,>(request: Omit<PrintRequest, 'id'> | Omit<PicturesRequest, 'id'> | Omit<ImportRequest, 'id'> | Omit<FlattenRequest, 'id'>) =>
      new Promise<T>((resolve, reject) => {
        next += 1;
        const id = `export-${next}`;
        pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
        sendBridgeMessage({ type: EXPORT_BUILD, payload: { ...request, id } as ExportRequest });
      });
    return {
      buildPrint: (tabs, options, title) => ask<PrintResult>({ tabs, options, title }),
      drawPictures: (requests) => ask<DrawnPictures>({ op: 'pictures', requests }),
      importHtml: (html) => ask<DocJSON>({ op: 'import', html }),
      flattenPicture: (dataUrl) => ask<string>({ op: 'flatten', dataUrl }),
    };
  },
  extendEditorState: () => ({}),
});
