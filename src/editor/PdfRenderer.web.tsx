import { forwardRef } from 'react';

import type { ExportBridgeInstance } from './bridges/export';

export interface PdfRendererHandle {
  build: ExportBridgeInstance['buildPrint'];
  drawPictures: ExportBridgeInstance['drawPictures'];
  importHtml: ExportBridgeInstance['importHtml'];
  flattenPicture: ExportBridgeInstance['flattenPicture'];
}

/** The laptop lays the pages out, draws the pictures and reads Word files in its own page (export.service), so it needs no renderer. */
export const PdfRenderer = forwardRef<PdfRendererHandle>(function PdfRenderer() {
  return null;
});
