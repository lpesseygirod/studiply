import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { BlockSpacing } from '../schema/blockSpacing';

/** Room to type around tables, and the gap cursor (step 4.5), in both editors. */
export const SpacingBridge = new BridgeExtension({
  tiptapExtension: BlockSpacing,
});
