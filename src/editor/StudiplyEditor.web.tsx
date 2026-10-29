import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { FileHandler } from '@tiptap/extension-file-handler';

import type { ThemeColors } from '../constants/colors';
import { Layout } from '../constants/layout';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { studiplyExtensions } from './bridges';
import { editorCss, PAGE_COLORS } from './editorCss';
import { FormatToolbar } from './FormatToolbar.web';
import { FormulaPopover } from './FormulaPopover.web';
import { PhotoMenu } from './PhotoMenu.web';
import { CommentMargin, CommentPopovers } from './Comments.web';
import { COMMENT_EVENT, COMMENT_MARGIN_GAP, COMMENT_MARGIN_W, listComments } from './schema/comments';
import { runFormat } from './format';
import { LinkBubble } from './LinkBubble.web';
import { setPhotoResolver } from './media/photoSource';
import { addPhotoFiles, pickPhotoFiles } from './photos.web';
import { TableMenus } from './TableMenus.web';
import { selectedChipMs } from './schema/timestampChip';
import { TableHandles } from './table/tableHandles';
import { A4 } from './page/pageLayout';
import { pageViewOf } from './page/pageView';
import { effectiveZoom, stepZoom, useViewPrefs } from '../lib/viewPrefs';
import { Typography } from '../constants/typography';
import { EMPTY_DOC, type DocJSON, type StudiplyEditorHandle, type StudiplyEditorProps } from './types';
import { editorPhotoSource } from '../services/doc-photo.service';

// Photos (`media:<id>`) show from their signed links.
setPhotoResolver(editorPhotoSource);

const SCOPE = 'studiply-editor';
const CANVAS_PADDING = 24;
const SCROLLBAR_W = 16;
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

  // Pages and zoom (step 4.5b), kept on this laptop: the sheet on the app's grey, which the
  // gaps between pages show too; Fit makes the sheet as wide as the column (at most 100 %).
  const { colors } = useTheme();
  const [viewPrefs, setViewPrefs] = useViewPrefs('laptop');
  const [room, setRoom] = useState(0);
  const pageView = pageViewOf(editor.state);
  const pages = !!pageView?.pages;
  // The room for the sheet: the column less the grey edges and the scrollbar.
  const sheetRoom = room - 2 * CANVAS_PADDING - SCROLLBAR_W;
  const zoom = effectiveZoom(viewPrefs?.zoom ?? 'fit', viewPrefs?.pages ?? true, sheetRoom, A4.width);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    if (viewPrefs && viewPrefs.pages !== pageViewOf(editor.state)?.pages) editor.commands.setPageView(viewPrefs.pages);
  }, [editor, viewPrefs]);
  useEffect(() => {
    if (zoom !== pageViewOf(editor.state)?.zoom) editor.commands.setPageZoom(zoom);
  }, [editor, zoom]);
  useEffect(() => {
    page?.style.setProperty('--studiply-canvas', colors.cardMuted);
  }, [page, colors.cardMuted]);
  // ⌘+ / ⌘− step the zoom and ⌘0 is 100 %, in place of the browser's zoom, while a document is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const next = e.key === '+' || e.key === '=' ? stepZoom(zoomRef.current, 1) : e.key === '-' || e.key === '_' ? stepZoom(zoomRef.current, -1) : e.key === '0' ? 1 : null;
      if (next === null) return;
      e.preventDefault();
      setViewPrefs({ zoom: next });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [setViewPrefs]);
  // "Page 3 of 12": the page in the middle of the view, shown while scrolling (as in Google Docs; it would cover the text).
  const [pageNow, setPageNow] = useState(1);
  const [pageLabel, setPageLabel] = useState(false);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = () => {
    followPage();
    setPageLabel(true);
    if (labelTimer.current) clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => setPageLabel(false), 1500);
  };
  useEffect(() => () => void (labelTimer.current && clearTimeout(labelTimer.current)), []);
  const pageCount = pageView?.layout?.pages ?? 1;
  const shownZoom = pageView?.zoom ?? zoom;
  const followPage = () => {
    const dom = editor.view.dom as HTMLElement;
    const box = page?.getBoundingClientRect();
    if (!box || !pages) return;
    const pitch = (A4.height + A4.gap) * (pageViewOf(editor.state)?.zoom ?? zoom);
    const middle = box.top + box.height / 2 - dom.getBoundingClientRect().top;
    setPageNow(Math.max(1, Math.min(pageCount, Math.floor(middle / pitch) + 1)));
  };
  useEffect(followPage);

  const withMargin = editable && commentRoom && listComments(editor.state.doc).some((c) => !c.resolved || c.id === activeComment);
  const marginShown = useRef(onCommentMargin);
  marginShown.current = onCommentMargin;
  useEffect(() => marginShown.current?.(withMargin), [withMargin]);

  return (
    <View style={[styles.container, pages && styles.containerPages, withMargin && (pages ? styles.containerPagesWithMargin : styles.containerWithMargin)]}>
        <style>{CSS}</style>
        {editable && (
          <FormatToolbar
            editor={editor}
            onImage={fileId ? () => pickPhotoFiles(editor, fileId) : undefined}
            onComment={() => editor.view.dom.dispatchEvent(new CustomEvent(COMMENT_EVENT, { bubbles: true }))}
            view={{ pages: viewPrefs?.pages ?? true, zoom: viewPrefs?.zoom ?? 'fit', shown: zoom, set: setViewPrefs }}
          />
        )}
        <View style={styles.row}>
          <View
            style={[styles.page, pages && styles.canvas]}
            ref={(v) => setPage(v as unknown as HTMLElement | null)}
            onLayout={(e) => setRoom(e.nativeEvent.layout.width)}
          >
            <ScrollView
              style={[styles.scroll, pages && styles.scrollBothWays]}
              onScroll={onScroll}
              scrollEventThrottle={100}
              contentContainerStyle={
                pages
                  ? [styles.canvasContent, A4.width * shownZoom > sheetRoom + 1 && { minWidth: A4.width * shownZoom + 2 * CANVAS_PADDING }]
                  : [styles.pageContent, narrow && styles.pageContentNarrow]
              }
            >
              {pages ? <View style={[styles.sheetHeader, { width: A4.width * shownZoom }]}>{header}</View> : header}
              <EditorContent editor={editor} className={SCOPE} />
            </ScrollView>
            {pages && pageCount > 1 && (
              <View style={[styles.pageCount, !pageLabel && styles.pageCountHidden]} pointerEvents="none">
                <Text style={styles.pageCountText}>
                  Page {pageNow} of {pageCount}
                </Text>
              </View>
            )}
            {editable && <LinkBubble editor={editor} page={page} />}
            {editable && <TableMenus editor={editor} />}
            {editable && <FormulaPopover editor={editor} />}
            {editable && <PhotoMenu editor={editor} />}
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
    // Pages: room for the A4 sheet and a grey edge around it.
    containerPages: { maxWidth: Math.max(Layout.documentMaxWidth, A4.width + 2 * CANVAS_PADDING) },
    containerPagesWithMargin: { maxWidth: Math.max(Layout.documentMaxWidth, A4.width + 2 * CANVAS_PADDING) + COMMENT_MARGIN_GAP + COMMENT_MARGIN_W },
    canvas: { backgroundColor: c.cardMuted },
    // A sheet wider than the column (zoomed in) scrolls sideways too.
    scrollBothWays: { overflowX: 'auto' } as object,
    canvasContent: { padding: CANVAS_PADDING, paddingBottom: 48 },
    sheetHeader: { maxWidth: '100%', alignSelf: 'center', paddingBottom: 12 },
    pageCount: { position: 'absolute', left: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    pageCountHidden: { opacity: 0 },
    pageCountText: { fontSize: Typography.size.xs, color: c.text.secondary, fontVariant: ['tabular-nums'] },
  });
