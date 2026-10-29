import type React from 'react';
import type { JSONContent } from '@tiptap/core';

import type { PasteReport } from './pasteReport';
import type { FormatCommand } from './format';
import type { CommentInfo } from './schema/comments';
import type { ViewPrefs } from '../lib/viewPrefs';

/** What the screen can do with a comment (the document menu's Comments). */
export type CommentCommand = Extract<FormatCommand, { type: 'comment' }>;

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
  /** Every comment in the document (step 4.5). */
  comments: () => Promise<CommentInfo[]>;
  /** Selects, edits, resolves or deletes a comment. */
  comment: (cmd: CommentCommand) => void;
  focus: () => void;
  /** Leaves the editor; on the iPhone this closes the keyboard. */
  blur: () => void;
};

export type StudiplyEditorProps = {
  initialContent?: DocJSON;
  /** The document's file: photos added go with it. Without it (a version's preview) none can be added. */
  fileId?: string;
  /** False: read only (a version's preview). */
  editable?: boolean;
  /** At the top of the page (title and meta line); on the iPhone hidden while typing. */
  header?: React.ReactNode;
  /** Laptop: the screen has room for a comments margin beside the page. */
  commentRoom?: boolean;
  /** Laptop: the margin is shown (or hidden); the screen widens the page's column for it. */
  onCommentMargin?: (shown: boolean) => void;
  /** The editor can be read and written. */
  onReady?: () => void;
  /** The student changed the document (read it with getJSON). */
  onChange?: () => void;
  /** Tapping (selecting) a timestamp chip. */
  onChipPress?: (ms: number) => void;
  /** After a paste with HTML: what it had and what the document kept. */
  onPaste?: (report: PasteReport) => void;
  /**
   * iPhone (step 4.5b): Print layout and the zoom, kept on the phone by the
   * screen (its … menu switches Print layout); a pinch reports the new zoom.
   * The laptop keeps its own, from its toolbar.
   */
  view?: ViewPrefs | null;
  onZoom?: (zoom: number) => void;
};
