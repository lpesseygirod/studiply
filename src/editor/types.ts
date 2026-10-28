import type React from 'react';
import type { JSONContent } from '@tiptap/core';

import type { PasteReport } from './pasteReport';

/** A document as ProseMirror JSON (what `documents.content` holds). */
export type DocJSON = JSONContent & { type: 'doc' };

export const EMPTY_DOC: DocJSON = { type: 'doc', content: [{ type: 'paragraph' }] };

/** What both editors (iPhone: TenTap in a WebView; laptop: Tiptap in the page) offer the screen. */
export type StudiplyEditorHandle = {
  getJSON: () => Promise<DocJSON>;
  getText: () => Promise<string>;
  /** Replaces the document as loaded (not the student's edit, not in Undo, no onChange). */
  loadDoc: (doc: DocJSON) => void;
  /** Takes `doc` changing only the blocks that differ, keeping the cursor (another device's changes). */
  applyBlocks: (doc: DocJSON) => void;
  insertTimestampChip: (ms: number) => void;
  focus: () => void;
  /** Leaves the editor; on the iPhone this closes the keyboard. */
  blur: () => void;
};

export type StudiplyEditorProps = {
  initialContent?: DocJSON;
  /** False: read only (a version's preview). */
  editable?: boolean;
  /** At the top of the page (title and meta line); on the iPhone hidden while typing. */
  header?: React.ReactNode;
  /** The editor can be read and written. */
  onReady?: () => void;
  /** The student changed the document (read it with getJSON). */
  onChange?: () => void;
  /** Tapping (selecting) a timestamp chip. */
  onChipPress?: (ms: number) => void;
  /** After a paste with HTML: what it had and what the document kept. */
  onPaste?: (report: PasteReport) => void;
  /** Laptop only: ms from a key press to the editor's update. */
  onTyping?: (ms: number) => void;
};
