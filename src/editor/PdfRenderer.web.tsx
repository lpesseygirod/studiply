import { forwardRef } from 'react';

import type { ExportBridgeInstance } from './bridges/export';

export interface PdfRendererHandle {
  build: ExportBridgeInstance['buildPrint'];
}

/** The laptop lays the pages out in its own page (export.service), so it needs no renderer. */
export const PdfRenderer = forwardRef<PdfRendererHandle>(function PdfRenderer() {
  return null;
});
