import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { BlockSpacing } from '../schema/blockSpacing';

/** Room to type around tables, and the gap cursor, in both editors. */
export const SpacingBridge = new BridgeExtension({
  tiptapExtension: BlockSpacing,
});
