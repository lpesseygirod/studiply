import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import StudiplyEditor from '../../../src/editor/StudiplyEditor';
import type { CommentCommand, StudiplyEditorHandle } from '../../../src/editor/types';
import { PAGE_COLORS } from '../../../src/editor/editorCss';
import { DocumentHeader } from '../../../src/components/editor/DocumentHeader';
import { DocumentTabs } from '../../../src/components/editor/DocumentTabs';
import { EarlierNotesCard } from '../../../src/components/editor/EarlierNotesCard';
import { VersionHistory } from '../../../src/components/editor/VersionHistory';
import { CommentsSheet } from '../../../src/components/editor/CommentsSheet';
import { COMMENT_MARGIN_GAP, COMMENT_MARGIN_W, type CommentInfo } from '../../../src/editor/schema/comments';
import { GradientFill } from '../../../src/components/GradientBackground';
import { IconButton } from '../../../src/components/IconButton';
import { anchorBelow, showAlert, type DialogButton } from '../../../src/components/dialogs/dialogs';
import { courseCrumbs, useShellScreen } from '../../../src/components/shell/ShellContext';
import { setCommentMarginShown, useCommentMargin } from '../../../src/components/shell/commentMargin';
import type { ThemeColors } from '../../../src/constants/colors';
import { Layout } from '../../../src/constants/layout';
import { Typography } from '../../../src/constants/typography';
import { saveLabel, useDocumentSync } from '../../../src/hooks/useDocumentSync';
import { useItemMenu } from '../../../src/hooks/useItemMenu';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { useUndoToast } from '../../../src/hooks/useUndoToast';
import { useViewPrefs } from '../../../src/lib/viewPrefs';
import { notifyLibraryUpdated, useLibraryUpdates } from '../../../src/lib/cache';
import type { FileRow } from '../../../src/lib/cloudRows';
import {
  ensureTranscriptDocument,
  getDocumentFile,
  openDocument,
  renameDocument,
  type DocTab,
} from '../../../src/services/document.service';
import { getFolderBreadcrumbs, type Breadcrumb } from '../../../src/services/folder.service';
import { getNoteBySession } from '../../../src/services/note.service';
import { getProject } from '../../../src/services/project.service';
import { getSession, renameSession } from '../../../src/services/session.service';
import { markOpened } from '../../../src/services/shelf.service';
import { getTranscriptBySession } from '../../../src/services/transcript.service';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { Note, Session } from '../../../src/types/database';
import { errorMessage } from '../../../src/utils/errors';
import type { ShelfItem } from '../../../src/utils/shelf';

const isTab = (v: unknown): v is DocTab => v === 'notes' || v === 'summary' || v === 'transcript';

const HINTS: Record<DocTab, string> = {
  notes: 'Your own notes for this lecture',
  summary: 'The summary is written into this tab',
  transcript: 'From the recording; correct anything it misheard',
};

const metaDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** What a lecture's Summary or Transcript tab shows when it has no document (yet). */
type TabState = 'loading' | 'document' | 'earlier' | 'none';

/**
 * A document (step 4.3): a blank document (its title and one page) or a
 * lecture (tabs My notes · Summary · Transcript), in the editor from 4.2,
 * saving itself (src/hooks/useDocumentSync). Looks as docs/design
 * desktop-01 (laptop) and iphone-06 (iPhone): the white page on the
 * gradient, the title and meta line, "Saved · time".
 */
export default function DocumentScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string; created?: string }>();
  const id = params.id;
  const styles = useThemedStyles(makeStyles);
  const { colors: c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const wide = useLayoutMode() === 'wide';
  const { showUndo, toast } = useUndoToast();

  const [file, setFile] = useState<FileRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [chain, setChain] = useState<Breadcrumb[]>([]);
  const [tab, setTab] = useState<DocTab>(isTab(params.tab) ? params.tab : 'notes');
  const [tabState, setTabState] = useState<TabState>('loading');
  const isLecture = file?.kind === 'lecture';

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(file?.course_id ? `/project/${file.course_id}` : '/library');
  }, [router, file?.course_id]);

  const itemMenu = useItemMenu({ showUndo, onTrashed: leave });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const f = await getDocumentFile(id);
      setFile(f);
      if (f.kind === 'lecture') {
        const [s, n] = await Promise.all([getSession(id), getNoteBySession(id).catch(() => null)]);
        setSession(s);
        setNote(n);
      }
      if (f.course_id) {
        const p = await getProject(f.course_id).catch(() => null);
        if (p) {
          setCourseName(p.name);
          setChain(f.folder_id ? await getFolderBreadcrumbs(f.folder_id, p.name).catch(() => []) : [{ id: null, name: p.name, type: 'project' }]);
        }
      } else {
        setCourseName(null);
        setChain([]);
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not open the document.'));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  // A rename, a move or a synced change from another device.
  useLibraryUpdates(() => void load());

  // Opening puts it at the top of Recent.
  useEffect(() => {
    if (id) markOpened(id);
  }, [id]);

  // A new document opens with its title selected, once (not again after going back to it).
  const created = params.created === '1';
  useEffect(() => {
    if (!created) return;
    const t = setTimeout(() => router.setParams({ created: undefined }), 1500);
    return () => clearTimeout(t);
  }, [created, router]);

  // A lecture's Summary and Transcript tabs: a document, or what's there
  // instead. Worked out when the tab (or what it depends on) changes, not
  // on every reload of the file (a rename must not remount the editor).
  const lectureStatus = session?.status;
  const kind = file?.kind;
  const hasNote = !!note;
  const shownTab = useRef<string | null>(null);
  useEffect(() => {
    if (!kind || !id) return;
    let live = true;
    const key = `${id}:${tab}`;
    if (shownTab.current !== key) setTabState('loading');
    shownTab.current = key;
    (async () => {
      if (kind !== 'lecture' || tab === 'notes') return 'document' as const;
      const opened = await openDocument(id, tab).catch(() => null);
      if (opened?.id) return 'document' as const;
      if (tab === 'summary') return hasNote ? ('earlier' as const) : ('none' as const);
      const transcript = await getTranscriptBySession(id).catch(() => null);
      const segments = Array.isArray(transcript?.segments) ? (transcript.segments as unknown as { start: number; text: string }[]) : [];
      if (segments.length === 0) return 'none' as const;
      await ensureTranscriptDocument(id, segments);
      return 'document' as const;
    })()
      .then((state) => live && setTabState(state))
      .catch(() => live && setTabState('none'));
    return () => {
      live = false;
    };
  }, [kind, id, tab, hasNote, lectureStatus]);

  // The editor, one per tab; its autosave starts once it is ready.
  const editorRef = useRef<StudiplyEditorHandle>(null);
  const editorKey = `${id}:${tab}`;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const showEditor = !!file && tabState === 'document';
  const sync = useDocumentSync({ fileId: showEditor ? id : undefined, tab, editor: editorRef, editorReady: showEditor && readyKey === editorKey });
  const status = showEditor ? saveLabel(sync.state) : null;

  const rename = useCallback(
    async (title: string) => {
      if (!file) return title;
      try {
        const saved = isLecture ? (await renameSession(file.id, title)).title : await renameDocument(file.id, title);
        notifyLibraryUpdated();
        return saved;
      } catch (err) {
        showAlert('Could not rename it', errorMessage(err, 'Please try again.'));
        throw err;
      }
    },
    [file, isLecture],
  );

  // The laptop's top bar: where it is, its title, when it was saved.
  useShellScreen(
    file ? { courseId: file.course_id, folderId: file.folder_id, itemId: file.id } : null,
    file ? { crumbs: courseCrumbs(file.course_id, chain), title: file.title, saved: status } : null,
  );

  const item: ShelfItem | null = useMemo(
    () =>
      file
        ? {
            id: file.id,
            type: isLecture ? 'lecture' : 'document',
            title: file.title,
            courseId: file.course_id,
            folderId: file.folder_id,
            courseName: courseName ?? undefined,
            updatedAt: file.updated_at,
            starredAt: file.starred_at,
            status: session?.status,
          }
        : null,
    [file, isLecture, courseName, session?.status],
  );

  const [historyOpen, setHistoryOpen] = useState(false);
  // The document menu's Comments (step 4.5): every comment, read from the editor when opened.
  const [comments, setComments] = useState<CommentInfo[] | null>(null);
  // Laptop: a comments margin beside the page when the shell has room; the columns widen while it shows.
  const margin = useCommentMargin();
  const commentRoom = wide && margin.room;
  useEffect(() => () => setCommentMarginShown(false), []);
  const openComments = async () => setComments((await editorRef.current?.comments()) ?? []);
  const onComment = (cmd: CommentCommand) => {
    editorRef.current?.comment(cmd);
    // The iPhone's list comes back with the editor's next state.
    setTimeout(() => void editorRef.current?.comments().then((list) => setComments((open) => (open ? list : open))), 150);
  };
  // iPhone (step 4.5b): Print layout and the zoom, kept on this phone (the laptop's are in its toolbar).
  const [phoneView, setPhoneView] = useViewPrefs('iphone');
  const menuButton = useRef<View>(null);
  const openMenu = async () => {
    if (!item) return;
    editorRef.current?.blur();
    const extra: DialogButton[] = showEditor
      ? [
          { text: 'Comments', icon: 'chatbox-ellipses-outline', onPress: () => void openComments() },
          { text: 'Version history', icon: 'time-outline', onPress: () => setHistoryOpen(true) },
          ...(Platform.OS !== 'web'
            ? [{ text: phoneView?.pages ? 'Print layout ✓' : 'Print layout', icon: 'document-outline' as const, onPress: () => setPhoneView({ pages: !phoneView?.pages }) }]
            : []),
        ]
      : [];
    itemMenu.open(item, await anchorBelow(menuButton), { skip: ['open'], dialogRename: true, extra });
  };

  const meta = file ? `${courseName ?? 'My library'} · ${isLecture ? 'Lecture' : 'Document'} · ${metaDate(file.created_at)}` : '';
  // The iPhone's editor is a WebView under the header, so the header keeps its own margins there.
  const nativeEditor = Platform.OS !== 'web';
  const makeHeader = (inset: boolean) =>
    file ? <DocumentHeader title={file.title} meta={meta} onRename={rename} selectTitle={created} compact={!wide} inset={inset} /> : null;

  const lostNotice =
    sync.state.lost.length > 0 ? (
      <Pressable onPress={sync.clearLost} style={styles.notice} accessibilityRole="button">
        <Text style={styles.noticeText}>
          A newer change from another device was kept. Yours is in version history.
        </Text>
        <Ionicons name="close" size={16} color={PAGE_COLORS.text.secondary} />
      </Pressable>
    ) : null;

  // The page when the tab has no document: the header and what's there instead.
  const placeholder = (
    <ScrollView style={styles.page} contentContainerStyle={[styles.pageContent, !wide && styles.pageContentCompact]}>
      {makeHeader(false)}
      {tabState === 'earlier' && note && (
        <EarlierNotesCard
          label="Notes in the earlier format"
          text={`${(note.summary ?? '').slice(0, 320)}${(note.summary ?? '').length > 320 ? '…' : ''}\n\nThese notes move into this tab in a later update. Until then they open in the notes view, with Clarify, Edit and Export PDF.`}
          action="Open notes"
          onAction={() => router.push({ pathname: '/note/[id]', params: { id: file!.id } })}
        />
      )}
      {tabState === 'none' && tab === 'summary' && (
        <EarlierNotesCard
          label="No summary yet"
          text={lectureStatus === 'completed' ? 'This lecture has no summary.' : "This lecture hasn't been summarized yet."}
          action={lectureStatus === 'completed' ? undefined : 'Process now'}
          onAction={() => router.push({ pathname: '/record/post-session', params: { sessionId: file!.id, title: file!.title } })}
        />
      )}
      {tabState === 'none' && tab === 'transcript' && <EarlierNotesCard label="No transcript yet" text="The transcript appears here once the recording is transcribed." />}
    </ScrollView>
  );

  const body = !file ? (
    <View style={styles.center}>{error ? <Text style={styles.errorText}>{error}</Text> : null}</View>
  ) : showEditor ? (
    <View style={[styles.editorWrap, !wide && nativeEditor && styles.pageCard]}>
      {lostNotice}
      <StudiplyEditor
        key={editorKey}
        ref={editorRef}
        fileId={id}
        header={makeHeader(nativeEditor)}
        commentRoom={commentRoom}
        onCommentMargin={setCommentMarginShown}
        onReady={() => setReadyKey(editorKey)}
        onChange={sync.onChange}
        view={nativeEditor ? phoneView : undefined}
        onZoom={(zoom) => setPhoneView({ zoom })}
      />
    </View>
  ) : tabState === 'loading' ? (
    <View style={[styles.page, !wide && styles.pageCard]} />
  ) : (
    <View style={[styles.editorWrap, !wide && styles.pageCard]}>{placeholder}</View>
  );

  // Accent purple as in the mockup; on the dimmed dark gradient, the strong text colour.
  const backColor = scheme === 'dark' ? c.text.onGradientStrong : c.accentDark;

  const top = wide ? (
    <View style={styles.topRow}>
      {isLecture && (
        <>
          <DocumentTabs tab={tab} onChange={setTab} />
          <Text style={styles.hint} numberOfLines={1}>
            {HINTS[tab]}
          </Text>
        </>
      )}
      <View style={styles.spacer} />
      <View ref={menuButton} collapsable={false}>
        <IconButton icon="ellipsis-horizontal" label="Document menu" onPress={openMenu} color={c.text.onGradientStrong} />
      </View>
    </View>
  ) : (
    // Above the page: a tap on its empty space closes the keyboard (buttons answer their own taps).
    <View onStartShouldSetResponder={() => true} onResponderRelease={() => editorRef.current?.blur()} style={[styles.phoneTop, { paddingTop: insets.top + 6 }]}>
      <View style={styles.phoneHeader}>
        <Pressable onPress={leave} style={styles.back} accessibilityRole="button" accessibilityLabel={`Back to ${courseName ?? 'Library'}`}>
          <Ionicons name="chevron-back" size={22} color={backColor} />
          <Text style={[styles.backText, { color: backColor }]} numberOfLines={1}>
            {courseName ?? 'Library'}
          </Text>
        </Pressable>
        <View ref={menuButton} collapsable={false}>
          <IconButton icon="ellipsis-horizontal" label="Document menu" onPress={openMenu} color={backColor} />
        </View>
      </View>
      {status && <Text style={styles.status}>{status}</Text>}
      {isLecture && <DocumentTabs tab={tab} onChange={setTab} fill />}
    </View>
  );

  // One tree for both layouts, so crossing the laptop width (a window being
  // resized) keeps the editor and its save session instead of remounting them.
  return (
    <View style={styles.container}>
      <GradientFill />
      {!wide && <ThemedStatusBar />}
      <View style={wide ? [styles.column, margin.shown && commentRoom && styles.columnWithMargin] : styles.container}>
        {top}
        <View style={wide ? styles.container : [styles.phoneBody, { paddingBottom: insets.bottom + 8 }]}>{body}</View>
      </View>
      {toast}
      {itemMenu.modal}
      <CommentsSheet
        visible={comments !== null}
        comments={comments ?? []}
        onClose={() => setComments(null)}
        onSelect={(id) => editorRef.current?.comment({ type: 'comment', action: 'select', id })}
        onEdit={(id, text) => onComment({ type: 'comment', action: 'edit', id, text })}
        onResolve={(id, resolved) => onComment({ type: 'comment', action: 'resolve', id, resolved })}
        onDelete={(id) => onComment({ type: 'comment', action: 'delete', id })}
      />
      {file && (
        <VersionHistory visible={historyOpen} fileId={file.id} tab={tab} onClose={() => setHistoryOpen(false)} onRestore={sync.restore} />
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    column: { flex: 1, width: '100%', maxWidth: Layout.documentMaxWidth + 48, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, gap: 12 },
    columnWithMargin: { maxWidth: Layout.documentMaxWidth + 48 + COMMENT_MARGIN_GAP + COMMENT_MARGIN_W },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
    hint: { flexShrink: 1, fontSize: Typography.size.sm, color: c.text.onGradient },
    spacer: { flex: 1 },
    editorWrap: { flex: 1 },
    page: { flex: 1, borderRadius: Layout.cardRadius.laptop, backgroundColor: PAGE_COLORS.card },
    pageContent: { paddingHorizontal: 60, paddingTop: 44, paddingBottom: 60 },
    pageContentCompact: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24 },
    pageCard: { flex: 1, borderRadius: Layout.cardRadius.iphone, overflow: 'hidden', backgroundColor: PAGE_COLORS.card },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    errorText: { fontSize: Typography.size.base, color: c.text.onGradientStrong, textAlign: 'center' },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: PAGE_COLORS.status.info.bg,
    },
    noticeText: { flex: 1, fontSize: Typography.size.sm, color: PAGE_COLORS.status.info.text },
    phoneTop: { paddingHorizontal: 12, gap: 8, paddingBottom: 10 },
    phoneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, flexShrink: 1, paddingRight: 8 },
    backText: { fontSize: Typography.size.md, fontWeight: Typography.weight.medium },
    status: { fontSize: Typography.size.xs, color: c.text.onGradient, marginTop: -6, marginLeft: 6 },
    phoneBody: { flex: 1, paddingHorizontal: 12 },
  });
