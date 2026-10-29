import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';
import { Extension } from '@tiptap/core';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontFamily, FontSize } from '@tiptap/extension-text-style';

import { formatState, runFormat, type FormatCommand, type FormatState } from '../format';
import { LINK_EVENT } from '../format/links';
import { SelectionBar } from '../format/selectionBar';
import { PasteRules } from '../paste/extension';
import { PageBreak, ParagraphFormat, Title, TITLE } from '../schema/blocks';
import { TypingShortcuts } from '../schema/typingShortcuts';

/**
 * Step 4.4's formatting in the shared schema: Title, page breaks, line
 * spacing and indent (schema/blocks), font family and size (in the
 * text-style mark TenTap's colour bridge already brings) and alignment.
 *
 * On the iPhone, native sends the toolbar's commands (`format`) and gets
 * the formatting where the selection is back in the bridge state, so the
 * keyboard toolbar and the Aa panel show what is active, as the laptop's
 * toolbar does from the same `formatState`.
 */

export type FormatBridgeState = { format: FormatState };
export type FormatBridgeInstance = { format: (cmd: FormatCommand) => void };

/**
 * Google Docs' shortcuts the extensions don't bring themselves (headings
 * ⌘⌥0–3, lists ⌘⇧7/8/9 and alignment ⌘⇧L/E/R/J come with Tiptap's).
 */
export const FormatShortcuts = Extension.create({
  name: 'formatShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-x': () => runFormat(this.editor, { type: 'mark', mark: 'strike' }),
      'Mod-Shift-.': () => runFormat(this.editor, { type: 'sizeStep', direction: 1 }),
      'Mod-Shift-,': () => runFormat(this.editor, { type: 'sizeStep', direction: -1 }),
      'Mod-\\': () => runFormat(this.editor, { type: 'clear' }),
      // ⌘K: the screen opens its link dialog (the laptop's toolbar listens).
      'Mod-k': () => this.editor.view.dom.dispatchEvent(new CustomEvent(LINK_EVENT, { bubbles: true })),
    };
  },
});

export const FORMAT = 'studiply-format';
export { LINK_EVENT };
type FormatMessage = { type: typeof FORMAT; payload: FormatCommand };

export const FormatBridge = new BridgeExtension<FormatBridgeState, FormatBridgeInstance, FormatMessage>({
  tiptapExtension: ParagraphFormat,
  tiptapExtensionDeps: [
    FormatShortcuts,
    // The bar over selected words (Comment, B, I, Highlight, Link), on both devices.
    SelectionBar,
    // "- ", "1. ", "# ", "> ", "[] ", $…$, $$…$$, **bold**… as they're typed.
    TypingShortcuts,
    PasteRules,
    Title,
    PageBreak,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ['paragraph', 'heading', TITLE], alignments: ['left', 'center', 'right', 'justify'] }),
  ],
  onBridgeMessage: (editor, message) => {
    if (message.type === FORMAT) runFormat(editor, message.payload);
    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    format: (cmd) => sendBridgeMessage({ type: FORMAT, payload: cmd }),
  }),
  extendEditorState: (editor) => ({ format: formatState(editor) }),
});
