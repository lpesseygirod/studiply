import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { Callout } from '../schema/callout';
import { FormulaCard } from '../schema/formulaCard';
import { MarkChip } from '../schema/markChip';

/**
 * Studiply's blocks (step 4.6) in the shared schema: callouts, mark chips
 * and formula cards (4.7c); the timestamp chip has its own bridge since 4.2.
 * Commands and the requests for their menus go through the FormatBridge
 * (`format`), like every other tool.
 */
export const StudyBlocksBridge = new BridgeExtension({
  tiptapExtension: Callout,
  tiptapExtensionDeps: [MarkChip, FormulaCard],
});
