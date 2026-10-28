import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { FileHandler } from '@tiptap/extension-file-handler';

import type { ThemeColors } from '../constants/colors';
import { Layout } from '../constants/layout';
import { useThemedStyles } from '../theme/ThemeProvider';
import { studiplyExtensions } from './bridges';
import { editorCss, PAGE_COLORS } from './editorCss';
import { FormatToolbar } from './FormatToolbar.web';
import { FormulaPopover } from './FormulaPopover.web';
import { CommentMargin, CommentPopovers } from './Comments.web';
import { COMMENT_EVENT, COMMENT_MARGIN_GAP, COMMENT_MARGIN_W, listComments } from './schema/comments';
import { runFormat } from './format';
import { LinkBubble } from './LinkBubble.web';
import { setPhotoResolver } from './media/photoSource';
import { addPhotoFiles, pickPhotoFiles } from './photos.web';
import { TableMenus } from './TableMenus.web';
import { selectedChipMs } from './schema/timestampChip';
import { TableHandles } from './table/tableHandles';
import { EMPTY_DOC, type DocJSON, type StudiplyEditorHandle, type StudiplyEditorProps } from './types';
import { editorPhotoSource } from '../services/doc-photo.service';

// Photos (`media:<id>`) show from their signed links.
setPhotoResolver(editorPhotoSource);

const SCOPE = 'studiply-editor';
// The page card gives the margins on the laptop; the text keeps room below.
const CSS = `${editorCss(`.${SCOPE}`)}
.${SCOPE} .ProseMirror { padding: 0 0 120px; min-height: 240px; outline: none; }
`;

/**
 * The laptop editor: Tiptap directly in the page (real browser paste and
 * shortcuts, no iframe), with the same extensions TenTap's WebView builds on
 * the iPhone, so both read and write the same JSON. As in the mockup
 * (docs/design/desktop-01): a toolbar card, then the white page with the
 * screen's `header` (title and meta line) above the text.
 */
const StudiplyEditor = forwardRef<StudiplyEditorHandle, StudiplyEditorProps>(function StudiplyEditor(
  { initialContent, fileId, editable = true, header, commentRoom = false, onCommentMargin, onReady, onChange, onChipPress, onPaste },
  ref,
) {
  const styles = useThemedStyles(makeStyles);
  const narrow = useWindowDimensions().width < 600;
  // Comments (step 4.5): a margin beside the page when the screen has room for both.
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [page, setPage] = useState<HTMLElement | null>(null);
  const photoFile = useRef(fileId);
  photoFile.current = fileId;
  // The laptop adds the table's hover handles (the iPhone has no hover), and
  // photos dropped on the page or pasted (a pasted page with pictures, from
  // Word or Docs, goes through the normal paste instead).
  const extensions = useMemo(
    () => [
      ...studiplyExtensions(),
      TableHandles,
      FileHandler.configure({
        onDrop: (e, files, pos) => {
          if (photoFile.current) void addPhotoFiles(e, photoFile.current, files, pos);
        },
        onPaste: (e, files, html) => {
          if (photoFile.current && !html) void addPhotoFiles(e, photoFile.current, files);
        },
      }),
    ],
    [],
  );
  const lastChip = useRef<number | null>(null);
  const lastPaste = useRef(0);

  // Callbacks change between renders; the editor reads the latest.
  const handlers = useRef({ onReady, onChange, onChipPress, onPaste });
  handlers.current = { onReady, onChange, onChipPress, onPaste };

  const editor = useEditor({
    extensions,
    content: initialContent ?? EMPTY_DOC,
    editable,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: e }) => {
      handlers.current.onChange?.();
      const report = e.storage.pasteReport?.last;
      if (report && report.id !== lastPaste.current) {
        lastPaste.current = report.id;
        handlers.current.onPaste?.(report);
      }
    },
    onSelectionUpdate: ({ editor: e }) => {
      const ms = selectedChipMs(e);
      if (ms !== null && ms !== lastChip.current) handlers.current.onChipPress?.(ms);
      lastChip.current = ms;
    },
  });

  // The editor exists from the first render (immediatelyRender); ready once mounted.
  useEffect(() => handlers.current.onReady?.(), []);

  useEffect(() => {
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  // Development: the Chrome checks read and drive both editors the same way
  // (the iPhone bundle sets the same global).
  if (__DEV__) (window as unknown as { studiplyEditor?: Editor }).studiplyEditor = editor;

  useImperativeHandle(
    ref,
    () => ({
      getJSON: async () => editor.getJSON() as DocJSON,
      getText: async () => editor.getText(),
      loadDoc: (doc) => editor.commands.loadDoc(doc),
      applyBlocks: (doc) => editor.commands.applyBlocks(doc),
      insertTimestampChip: (ms) => editor.chain().focus().insertTimestampChip(ms).run(),
      comments: async () => listComments(editor.state.doc),
      comment: (cmd) => void runFormat(editor, cmd),
      focus: () => editor.commands.focus(),
      blur: () => editor.commands.blur(),
    }),
    [editor],
  );

  const withMargin = editable && commentRoom && listComments(editor.state.doc).some((c) => !c.resolved || c.id === activeComment);
  const marginShown = useRef(onCommentMargin);
  marginShown.current = onCommentMargin;
  useEffect(() => marginShown.current?.(withMargin), [withMargin]);

  return (
    <View style={[styles.container, withMargin && styles.containerWithMargin]}>
        <style>{CSS}</style>
        {editable && (
          <FormatToolbar
            editor={editor}
            onImage={fileId ? () => pickPhotoFiles(editor, fileId) : undefined}
            onComment={() => editor.view.dom.dispatchEvent(new CustomEvent(COMMENT_EVENT, { bubbles: true }))}
          />
        )}
        <View style={styles.row}>
          <View style={styles.page} ref={(v) => setPage(v as unknown as HTMLElement | null)}>
            <ScrollView style={styles.scroll} contentContainerStyle={[styles.pageContent, narrow && styles.pageContentNarrow]}>
              {header}
              <EditorContent editor={editor} className={SCOPE} />
            </ScrollView>
            {editable && <LinkBubble editor={editor} page={page} />}
            {editable && <TableMenus editor={editor} />}
            {editable && <FormulaPopover editor={editor} />}
            {editable && <CommentPopovers editor={editor} wide={commentRoom} onActive={setActiveComment} />}
          </View>
          {withMargin && <CommentMargin editor={editor} active={activeComment} onActive={setActiveComment} />}
        </View>
    </View>
  );
});

export default StudiplyEditor;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, width: '100%', maxWidth: Layout.documentMaxWidth, alignSelf: 'center', gap: 12 },
    containerWithMargin: { maxWidth: Layout.documentMaxWidth + COMMENT_MARGIN_GAP + COMMENT_MARGIN_W },
    row: { flex: 1, flexDirection: 'row', gap: COMMENT_MARGIN_GAP },
    page: { flex: 1, borderRadius: Layout.cardRadius.laptop, backgroundColor: PAGE_COLORS.card, overflow: 'hidden' },
    scroll: { flex: 1 },
    pageContent: { paddingHorizontal: 60, paddingTop: 44 },
    pageContentNarrow: { paddingHorizontal: 20, paddingTop: 20 },
  });
