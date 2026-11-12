import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { LiveStamps, setRecordingClock } from '../schema/liveStamps';

/**
 * Live notes on the iPhone: native tells the WebView the
 * recording time now and then (`ms` at `at`, and whether it is running), and
 * the WebView counts from it, so a line's stamp needs no round trip while
 * typing. `ms` null: nothing records, no stamps.
 */

export type RecordingClockPayload = { ms: number | null; running: boolean; at: number };
export type LiveStampsInstance = { setRecordingClock: (clock: RecordingClockPayload) => void };

export const SET_RECORDING_CLOCK = 'set-recording-clock';
type LiveStampsMessage = { type: typeof SET_RECORDING_CLOCK; payload: RecordingClockPayload };

export const LiveStampsBridge = new BridgeExtension<object, LiveStampsInstance, LiveStampsMessage>({
  tiptapExtension: LiveStamps,
  onBridgeMessage: (editor, message) => {
    if (message.type === SET_RECORDING_CLOCK) {
      const { ms, running, at } = message.payload;
      setRecordingClock(editor, ms === null ? null : running ? () => ms + Math.max(0, Date.now() - at) : () => ms);
    }
    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    setRecordingClock: (clock) => sendBridgeMessage({ type: SET_RECORDING_CLOCK, payload: clock }),
  }),
  extendEditorState: () => ({}),
});
