import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { runFormat } from '../format';
import { transformPastedHTML } from './rules';

/**
 * Paste: Google Docs and Word HTML rewritten into Studiply's
 * styles (rules.ts), and Paste without formatting.
 *
 * ⌘⇧V lets the browser's paste happen (it is the only way to read the
 * clipboard without asking for permission) and marks it plain: the paste
 * the browser fires while the keys are down inserts the text alone and is
 * blocked from the browser. Releasing the keys ends the mark, so a ⌘⇧V
 * that pasted nothing (an empty clipboard) never turns a later, ordinary
 * paste plain. On the iPhone the Aa panel reads the clipboard natively.
 */

export const PASTE_RULES = 'pasteRules';
/** At most this long, in case the keys' release is never seen. */
const PLAIN_FOR_MS = 1000;
const pluginKey = new PluginKey(PASTE_RULES);

export const PasteRules = Extension.create<object, { plainUntil: number }>({
  name: PASTE_RULES,

  addStorage() {
    return { plainUntil: 0 };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-v': () => {
        this.storage.plainUntil = Date.now() + PLAIN_FOR_MS;
        // Not handled: the browser goes on to paste, and the paste below takes it.
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const editor = this.editor;
    return [
      new Plugin({
        key: pluginKey,
        props: {
          transformPastedHTML: (html) => transformPastedHTML(html),
          handleDOMEvents: {
            keyup: () => {
              storage.plainUntil = 0;
              return false;
            },
          },
          handlePaste: (_view, event) => {
            if (Date.now() > storage.plainUntil) return false;
            storage.plainUntil = 0;
            const text = event.clipboardData?.getData('text/plain') ?? '';
            if (!text) return false;
            runFormat(editor, { type: 'insertText', text });
            return true;
          },
        },
      }),
    ];
  },
});
