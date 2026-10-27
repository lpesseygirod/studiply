import type { JSONContent } from '@tiptap/core';

import type { PasteReport } from './pasteReport';

/** A document as ProseMirror JSON (what `documents.content` holds). */
export type DocJSON = JSONContent & { type: 'doc' };

export const EMPTY_DOC: DocJSON = { type: 'doc', content: [{ type: 'paragraph' }] };

/** What both editors (iPhone: TenTap in a WebView; laptop: Tiptap in the page) offer the screen. */
export type StudiplyEditorHandle = {
  getJSON: () => Promise<DocJSON>;
  getText: () => Promise<string>;
  setContent: (doc: DocJSON) => void;
  insertTimestampChip: (ms: number) => void;
};

export type StudiplyEditorProps = {
  initialContent?: DocJSON;
  /** The editor can be read and written. */
  onReady?: () => void;
  /** Tapping (selecting) a timestamp chip. */
  onChipPress?: (ms: number) => void;
  /** After a paste with HTML: what it had and what the document kept. */
  onPaste?: (report: PasteReport) => void;
  /** Laptop only: ms from a key press to the editor's update. */
  onTyping?: (ms: number) => void;
};
