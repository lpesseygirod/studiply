import type React from 'react';
import type { JSONContent } from '@tiptap/core';

import type { PasteReport } from './pasteReport';
import type { FormatCommand } from './format';
import type { CommentInfo } from './schema/comments';
import type { LinkedMark, MarkPlace } from './schema/markChip';
import type { ViewPrefs } from '../lib/viewPrefs';
import type { PageSetup } from './page/pageSetup';

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
  /** Writing tools (step 4.7), from the document menu: the find bar (with Replace), the outline, the word count. */
  tool: (which: WritingTool) => void;
  /** A format command from the screen (step 5.5: a mark made while recording goes in, or comes back after Remove). */
  run: (cmd: FormatCommand) => void;
};

export type WritingTool = 'find' | 'replace' | 'outline' | 'wordCount';

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
  /** The document's page setup (after test D): paper, margins, page numbers, gap. */
  pageSetup?: PageSetup;
  /** Under the document (the mini player, step 4.6): under the pages on the laptop, above the keyboard toolbar on the iPhone. */
  footer?: React.ReactNode;
  /** The document's language ('es', 'en'…): the lecture's, else the account's. Graphs write Spanish decimals with a comma (step 4.7d). */
  language?: string | null;
  /**
   * Live notes (step 5.4): the recording time now (ms on the recorder's timeline), or null when
   * nothing records. Given for a lecture's My notes; each new line then starts with that time.
   */
  recordingClock?: () => number | null;
  /** A mark made while recording was removed from its chip's panel (step 5.5): the screen offers Undo. */
  onMarkRemoved?: (mark: LinkedMark, at: MarkPlace) => void;
};
