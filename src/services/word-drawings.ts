import type { DrawRequest } from '../editor/export/docxPictures';
import type { DrawnPictures } from '../editor/bridges/export';

/**
 * The iPhone's drawings for the Word export: the formulas and
 * graphs are drawn by the editor bundle in the export WebView (`draw`, the
 * PdfRenderer's), as the page draws them.
 */
export async function drawWordPictures(requests: DrawRequest[], draw?: (requests: DrawRequest[]) => Promise<DrawnPictures>): Promise<DrawnPictures> {
  if (!requests.length) return { pictures: [], failed: [] };
  if (!draw) throw new Error('Could not make the Word file.');
  return draw(requests);
}
