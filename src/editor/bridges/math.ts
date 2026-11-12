import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';

import { Formulas } from '../schema/formula';

/**
 * Formulas in the shared schema: inline (in the line) and
 * display (a centred block of its own, KaTeX's display mode), drawn with
 * KaTeX in both editors. A formula that isn't valid LaTeX shows its text in
 * red instead of breaking the page. Commands and the request to edit one go
 * through the FormatBridge (`format`), like every other tool.
 *
 * The two nodes are configured one by one: Tiptap's `Mathematics` gives
 * both the same KaTeX options, so display formulas weren't in display mode.
 */
export const MathBridge = new BridgeExtension({
  tiptapExtension: InlineMath.configure({ katexOptions: { throwOnError: false } }),
  tiptapExtensionDeps: [BlockMath.configure({ katexOptions: { throwOnError: false, displayMode: true } }), Formulas],
});
