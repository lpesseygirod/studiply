import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import { MIN_ZOOM, pageViewOf } from './page/pageView';
import { effectiveZoom, stepZoom, useViewPrefs } from '../lib/viewPrefs';
import { Typography } from '../constants/typography';
import { EMPTY_DOC, type DocJSON, type StudiplyEditorHandle, type StudiplyEditorProps, type WritingTool } from './types';
import { FindBar } from './FindBar.web';
import { FIND_EVENT, OUTLINE_EVENT } from './writing/find';
import { counts, countsLine, type Counts } from './writing/counts';
import { outline } from './writing/outline';
import { OutlineList } from '../components/editor/OutlineList';
import { showAlert } from '../components/dialogs/dialogs';
import { editorPhotoSource } from '../services/doc-photo.service';

// Photos (`media:<id>`) show from their signed links.
setPhotoResolver(editorPhotoSource);

const SCOPE = 'studiply-editor';
const CANVAS_PADDING = 24;
/** The outline's column beside the page (step 4.7). */
const OUTLINE_W = 220;
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
  const { width } = useWindowDimensions();
  const narrow = width < 600;
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
    // The line being written keeps room above the page's bottom edge (the status line sits right under it, step 4.7):
    // within 48 px of the edge the page scrolls it up to 64 px. Flush against the edge, a drag across it
    // makes the browser scroll the page under the mouse (its autoscroll edge), and the selection runs on.
    editorProps: { scrollThreshold: { top: 0, right: 0, left: 0, bottom: 48 }, scrollMargin: { top: 5, right: 5, left: 5, bottom: 64 } },
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
      tool: (which) => openTool(which),
    }),
    // openTool only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // Writing tools (step 4.7): the find bar (⌘F, ⌘⇧H with Replace), the outline (⌘⌥A), the word count.
  const [find, setFind] = useState<{ replace: boolean; opened: number } | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const openFind = (replace: boolean) => setFind((f) => ({ replace, opened: (f?.opened ?? 0) + 1 }));
  const openTool = (which: WritingTool) => {
    if (which === 'find' || which === 'replace') openFind(which === 'replace');
    else if (which === 'outline') setOutlineOpen((open) => !open);
    else showWordCount(counts(editor.state));
  };
  useEffect(() => {
    const dom = editor.view.dom;
    const onFind = (e: Event) => setFind((f) => ({ replace: !!(e as CustomEvent<{ replace?: boolean }>).detail?.replace, opened: (f?.opened ?? 0) + 1 }));
    const onOutline = () => setOutlineOpen((open) => !open);
    dom.addEventListener(FIND_EVENT, onFind);
    dom.addEventListener(OUTLINE_EVENT, onOutline);
    return () => {
      dom.removeEventListener(FIND_EVENT, onFind);
      dom.removeEventListener(OUTLINE_EVENT, onOutline);
    };
  }, [editor]);
  const wordCounts = counts(editor.state);
  const docOutline = outline(editor.state);
  const [rowWidth, setRowWidth] = useState(0);

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
  // The outline: beside the page in the laptop layout while the page keeps its room (the sheet at 50 % at least in Pages,
  // 480 px in Pageless); over it otherwise (a narrower window, or the assistant open beside a small one).
  const besideRoom = rowWidth - OUTLINE_W - COMMENT_MARGIN_GAP - marginRoom;
  const outlineBeside = width >= 1024 && (rowWidth === 0 || (pages ? besideRoom - 2 * CANVAS_PADDING - SCROLLBAR_W >= sheet.width * MIN_ZOOM : besideRoom >= 480));
  const outlinePanel = editable && outlineOpen && (
    <View style={outlineBeside ? styles.outline : styles.outlineOver} accessibilityLabel="Outline" {...{ dataSet: { outline: 'panel' } }}>
      <View style={styles.outlineHead}>
        <Text style={styles.outlineTitle}>Outline</Text>
        <Pressable onPress={() => setOutlineOpen(false)} style={styles.outlineClose} accessibilityRole="button" accessibilityLabel="Close outline">
          <Text style={styles.outlineCloseText}>✕</Text>
        </Pressable>
      </View>
      <OutlineList
        headings={docOutline.headings}
        current={docOutline.current}
        onPick={(h) => {
          runFormat(editor, { type: 'outline', pos: h.pos });
          editor.commands.focus();
          if (!outlineBeside) setOutlineOpen(false);
        }}
      />
    </View>
  );
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
  // "Page 3 of 12": the page in the middle of the view, in the status line under the page.
  const [pageNow, setPageNow] = useState(1);
  const onScroll = () => followPage();
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
        {editable && find && (
          <View style={pages && styles.toolbarPages}>
            <FindBar editor={editor} replace={find.replace} opened={find.opened} onReplace={(on) => setFind((f) => f && { ...f, replace: on })} onClose={() => setFind(null)} />
          </View>
        )}
        <View style={styles.row} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
          {outlineBeside && outlinePanel}
          <View style={styles.pageColumn}>
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
              {!outlineBeside && outlinePanel}
              {editable && <LinkBubble editor={editor} page={page} />}
              {editable && <TableMenus editor={editor} />}
              {editable && <FormulaPopover editor={editor} />}
              {editable && <PhotoMenu editor={editor} />}
              {editable && <BlockMenus editor={editor} />}
              {editable && <GraphPopover editor={editor} />}
              {editable && <CommentPopovers editor={editor} wide={commentRoom} onActive={setActiveComment} />}
            </View>
            {/* The status line (step 4.7), under the page and never over its text: "Page 3 of 12" (Pages), and the
                word count, the selection's too when words are selected; a click gives the details. */}
            {editable && (
              <View style={styles.status} {...{ dataSet: { status: 'line' } }}>
                {pages && pageCount > 1 ? (
                  <View style={styles.statusPill}>
                    <Text style={styles.statusText}>
                      Page {pageNow} of {pageCount}
                    </Text>
                  </View>
                ) : (
                  <View />
                )}
                <Pressable
                  onPress={() => showWordCount(wordCounts)}
                  style={styles.statusPill}
                  accessibilityRole="button"
                  accessibilityLabel={`Word count: ${countsLine(wordCounts)}`}
                  {...{ dataSet: { wordCount: 'line' } }}
                >
                  <Text style={styles.statusText}>{countsLine(wordCounts)}</Text>
                </Pressable>
              </View>
            )}
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
    // The page and, under it, the status line (step 4.7: outside the page, so it never covers text).
    pageColumn: { flex: 1, minWidth: 0, gap: 8 },
    status: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingBottom: 8 },
    statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    statusText: { fontSize: Typography.size.xs, color: c.text.secondary, fontVariant: ['tabular-nums'] },
    // Writing tools (step 4.7).
    outline: { width: OUTLINE_W, flexShrink: 0, borderRadius: Layout.cardRadius.laptop, backgroundColor: c.card, overflow: 'hidden' },
    outlineOver: {
      position: 'absolute',
      left: 8,
      top: 8,
      bottom: 8,
      width: OUTLINE_W,
      zIndex: 10,
      borderRadius: Layout.cardRadius.laptop,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    outlineHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, paddingTop: 8 },
    outlineTitle: { flex: 1, fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, letterSpacing: 1, textTransform: 'uppercase', color: c.text.secondary },
    outlineClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    outlineCloseText: { fontSize: Typography.size.sm, color: c.text.secondary },
  });

/** The details behind the status line (Word count in the document menu too). */
function showWordCount(c: Counts) {
  const n = (x: number) => x.toLocaleString('en-GB');
  const lines = [`Words: ${n(c.words)}`, `Characters: ${n(c.characters)}`, `Characters without spaces: ${n(c.charactersNoSpaces)}`];
  if (c.selection) lines.push('', `Selected: ${n(c.selection.words)} words, ${n(c.selection.characters)} characters`);
  showAlert('Word count', lines.join('\n'));
}
