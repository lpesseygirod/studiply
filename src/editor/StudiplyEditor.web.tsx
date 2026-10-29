import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { FileHandler } from '@tiptap/extension-file-handler';

import type { ThemeColors } from '../constants/colors';
import { Layout } from '../constants/layout';
import { useThemedStyles } from '../theme/ThemeProvider';
import { studiplyExtensions } from './bridges';
import { editorCss, PAGE_COLORS } from './editorCss';
import { FormatToolbar } from './FormatToolbar.web';
import { FormulaPopover } from './FormulaPopover.web';
import { PhotoMenu } from './PhotoMenu.web';
import { BlockMenus } from './BlockMenus.web';
import { GraphPopover } from './GraphPopover.web';
import { cleanLang, LANG_EVENT } from './schema/graph';
import { CommentMargin, CommentPopovers } from './Comments.web';
import { setDocumentPages } from '../components/shell/commentMargin';
import { COMMENT_EVENT, COMMENT_MARGIN_GAP, COMMENT_MARGIN_W, listComments } from './schema/comments';
import { runFormat } from './format';
import { LinkBubble } from './LinkBubble.web';
import { setPhotoResolver } from './media/photoSource';
import { addPhotoFiles, pickPhotoFiles } from './photos.web';
import { TableMenus } from './TableMenus.web';
import { selectedChipMs } from './schema/timestampChip';
import { TableHandles } from './table/tableHandles';
import { DEFAULT_SHEET } from './page/pageSetup';
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
  { initialContent, fileId, editable = true, header, commentRoom = false, onCommentMargin, onReady, onChange, onChipPress, onPaste, pageSetup, footer, language },
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
  // The page's language (step 4.7d): graphs write Spanish decimals with a comma; also the spellchecker's language.
  useEffect(() => {
    if (!editor) return;
    const lang = cleanLang(language);
    if (lang) editor.view.dom.setAttribute('lang', lang);
    else editor.view.dom.removeAttribute('lang');
    document.dispatchEvent(new Event(LANG_EVENT));
  }, [editor, language]);

  useEffect(() => handlers.current.onReady?.(), []);

  useEffect(() => {
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  // Development: the Chrome checks read and drive both editors the same way
  // (the iPhone bundle sets the same global).
  // The iPhone's injected CSS too (the bundle page in the checks has none).
  if (__DEV__) Object.assign(window as unknown as { studiplyEditor?: Editor; studiplyEditorCss?: () => string }, { studiplyEditor: editor, studiplyEditorCss: () => editorCss() });

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

  // Pages and zoom (step 4.5b), kept on this laptop. In Pages (after test D) the white pages sit on
  // the app's gradient in the whole centre pane, which scrolls (no card, no box); Fit makes the
  // sheet as wide as the pane allows (at most 100 %).
  const [viewPrefs, setViewPrefs] = useViewPrefs('laptop');
  const [room, setRoom] = useState(0);
  const pageView = pageViewOf(editor.state);
  const pages = !!pageView?.pages;
  // The document's page (page setup): its paper, margins and gap.
  const sheet = pageView?.sheet ?? DEFAULT_SHEET;
  useEffect(() => setDocumentPages(pages), [pages]);
  useEffect(() => {
    if (pageSetup) editor.commands.setPageSetup(pageSetup);
  }, [editor, pageSetup]);
  // On the gradient, the scrollbar has no track (after test D).
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (node) node.style.scrollbarColor = pages ? `${PAGE_COLORS.scrim} transparent` : '';
  }, [pages]);
  useEffect(() => () => setDocumentPages(false), []);
  // The room for the sheet: the pane less its edges, the scrollbar and the comments margin beside the sheet.
  const marginRoom = withMargin ? COMMENT_MARGIN_GAP + COMMENT_MARGIN_W : 0;
  const sheetRoom = room - 2 * CANVAS_PADDING - SCROLLBAR_W - marginRoom;
  const zoom = effectiveZoom(viewPrefs?.zoom ?? 'fit', viewPrefs?.pages ?? true, sheetRoom, sheet.width);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    if (viewPrefs && viewPrefs.pages !== pageViewOf(editor.state)?.pages) editor.commands.setPageView(viewPrefs.pages);
  }, [editor, viewPrefs]);
  useEffect(() => {
    if (zoom !== pageViewOf(editor.state)?.zoom) editor.commands.setPageZoom(zoom);
  }, [editor, zoom]);
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
    const pitch = (sheet.height + sheet.gap) * (pageViewOf(editor.state)?.zoom ?? zoom);
    const middle = box.top + box.height / 2 - dom.getBoundingClientRect().top;
    setPageNow(Math.max(1, Math.min(pageCount, Math.floor(middle / pitch) + 1)));
  };
  useEffect(followPage);

  const margin = withMargin && <CommentMargin editor={editor} active={activeComment} onActive={setActiveComment} />;

  return (
    <View style={[styles.container, pages ? styles.containerPages : withMargin && styles.containerWithMargin]}>
        <style>{CSS}</style>
        {editable && (
          <View style={pages && styles.toolbarPages}>
            <FormatToolbar
              editor={editor}
              onImage={fileId ? () => pickPhotoFiles(editor, fileId) : undefined}
              onComment={() => editor.view.dom.dispatchEvent(new CustomEvent(COMMENT_EVENT, { bubbles: true }))}
              view={{ pages: viewPrefs?.pages ?? true, zoom: viewPrefs?.zoom ?? 'fit', shown: zoom, set: setViewPrefs }}
            />
          </View>
        )}
        <View style={styles.row}>
          <View
            style={[styles.page, pages && styles.pageOnGradient]}
            ref={(v) => setPage(v as unknown as HTMLElement | null)}
            onLayout={(e) => setRoom(e.nativeEvent.layout.width)}
          >
            <ScrollView
              style={[styles.scroll, pages && styles.scrollBothWays]}
              ref={scrollRef}
              onScroll={onScroll}
              scrollEventThrottle={100}
              contentContainerStyle={
                pages
                  ? [styles.canvasContent, sheet.width * shownZoom > sheetRoom + 1 && { minWidth: sheet.width * shownZoom + marginRoom + 2 * CANVAS_PADDING }]
                  : [styles.pageContent, narrow && styles.pageContentNarrow]
              }
            >
              {/* One tree in both views, so switching keeps the editor where it is. In Pages the comments margin scrolls beside the sheet. */}
              <View style={pages && styles.sheetRow}>
                <View style={pages && { width: sheet.width * shownZoom }}>
                  <View style={pages && styles.sheetHeader}>{header}</View>
                  <EditorContent editor={editor} className={SCOPE} />
                </View>
                {pages && margin}
              </View>
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
            {editable && <BlockMenus editor={editor} />}
            {editable && <GraphPopover editor={editor} />}
            {editable && <CommentPopovers editor={editor} wide={commentRoom} onActive={setActiveComment} />}
          </View>
          {!pages && margin}
        </View>
        {footer ? <View style={pages ? styles.footerPages : undefined}>{footer}</View> : null}
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
    // Pages: the whole pane, on the gradient; the toolbar keeps the document's width.
    containerPages: { maxWidth: '100%' },
    toolbarPages: { width: '100%', maxWidth: Layout.documentMaxWidth + 2 * CANVAS_PADDING, alignSelf: 'center', paddingHorizontal: CANVAS_PADDING },
    pageOnGradient: { backgroundColor: 'transparent', borderRadius: 0 },
    footerPages: { width: '100%', maxWidth: Layout.documentMaxWidth + 2 * CANVAS_PADDING, alignSelf: 'center', paddingHorizontal: CANVAS_PADDING, paddingBottom: 12 },
    // A sheet wider than the pane (zoomed in) scrolls sideways too.
    scrollBothWays: { overflowX: 'auto' } as object,
    canvasContent: { paddingHorizontal: CANVAS_PADDING, paddingTop: 4, paddingBottom: 48 },
    sheetRow: { flexDirection: 'row', alignSelf: 'center', gap: COMMENT_MARGIN_GAP },
    sheetHeader: { paddingBottom: 12 },
    pageCount: { position: 'absolute', left: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    pageCountHidden: { opacity: 0 },
    pageCountText: { fontSize: Typography.size.xs, color: c.text.secondary, fontVariant: ['tabular-nums'] },
  });
