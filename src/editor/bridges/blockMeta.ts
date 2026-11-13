import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { BlockMeta } from '../schema/blockMeta';
import type { DocJSON } from '../types';

/**
 * Block ids and origins on the iPhone: the WebView runs the same
 * plugin, and native loads a document or takes the other device's changes
 * through these messages (TenTap's own setContent would count as the
 * student typing everything).
 */

export type BlockMetaInstance = {
  loadDoc: (doc: DocJSON) => void;
  applyBlocks: (doc: DocJSON) => void;
};

export const LOAD_DOC = 'load-doc';
export const APPLY_BLOCKS = 'apply-blocks';
type BlockMetaMessage = { type: typeof LOAD_DOC | typeof APPLY_BLOCKS; payload: DocJSON };

export const BlockMetaBridge = new BridgeExtension<object, BlockMetaInstance, BlockMetaMessage>({
  tiptapExtension: BlockMeta,
  onBridgeMessage: (editor, message) => {
    if (message.type === LOAD_DOC) editor.commands.loadDoc(message.payload);
    else if (message.type === APPLY_BLOCKS) editor.commands.applyBlocks(message.payload);
    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    loadDoc: (doc) => sendBridgeMessage({ type: LOAD_DOC, payload: doc }),
    applyBlocks: (doc) => sendBridgeMessage({ type: APPLY_BLOCKS, payload: doc }),
  }),
});
