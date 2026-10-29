import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { Callout } from '../schema/callout';
import { MarkChip } from '../schema/markChip';

/**
 * Studiply's blocks (step 4.6) in the shared schema: callouts and mark
 * chips (the timestamp chip has its own bridge since 4.2). Commands and the
 * requests for their menus go through the FormatBridge (`format`), like
 * every other tool.
 */
export const StudyBlocksBridge = new BridgeExtension({
  tiptapExtension: Callout,
  tiptapExtensionDeps: [MarkChip],
});
