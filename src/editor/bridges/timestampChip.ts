import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { selectedChipMs, TimestampChip } from '../schema/timestampChip';

/**
 * The chip on the iPhone, through TenTap's bridge: native asks the WebView
 * to insert a chip, and the WebView reports the chip the selection is on
 * (tapping a chip selects it) in the bridge state.
 */

export type TimestampChipState = { selectedChipMs: number | null };
export type TimestampChipInstance = { insertTimestampChip: (ms: number) => void };

export const INSERT_TIMESTAMP_CHIP = 'insert-timestamp-chip';
type TimestampChipMessage = { type: typeof INSERT_TIMESTAMP_CHIP; payload: number };

export const TimestampChipBridge = new BridgeExtension<TimestampChipState, TimestampChipInstance, TimestampChipMessage>({
  tiptapExtension: TimestampChip,
  onBridgeMessage: (editor, message) => {
    if (message.type === INSERT_TIMESTAMP_CHIP) {
      editor.chain().focus().insertTimestampChip(message.payload).run();
    }
    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    insertTimestampChip: (ms) => sendBridgeMessage({ type: INSERT_TIMESTAMP_CHIP, payload: ms }),
  }),
  extendEditorState: (editor) => ({ selectedChipMs: selectedChipMs(editor) }),
});
