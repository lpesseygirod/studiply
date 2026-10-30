import type { DrawRequest } from '../editor/export/docxPictures';
import type { DrawnPictures } from '../editor/bridges/export';

/**
 * The laptop draws the Word export's formulas and graphs in its own page
 * (step 4.8b), with KaTeX's stylesheet and fonts as the formula editor adds
 * them (the iPhone's drawings come from its export WebView: word-drawings.ts).
 */
export async function drawWordPictures(requests: DrawRequest[]): Promise<DrawnPictures> {
  if (!requests.length) return { pictures: [], failed: [] };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('katex/dist/katex.min.css');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../editor/katexFonts.web');
  const { makePictures } = await import('../editor/export/pictures');
  return makePictures(requests);
}
