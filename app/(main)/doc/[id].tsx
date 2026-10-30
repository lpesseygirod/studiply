import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import StudiplyEditor from '../../../src/editor/StudiplyEditor';
import type { CommentCommand, DocJSON, StudiplyEditorHandle } from '../../../src/editor/types';
import { PAGE_COLORS } from '../../../src/editor/editorCss';
import { DocumentHeader } from '../../../src/components/editor/DocumentHeader';
import { DocumentTabs } from '../../../src/components/editor/DocumentTabs';
import { EarlierNotesCard } from '../../../src/components/editor/EarlierNotesCard';
import { VersionHistory } from '../../../src/components/editor/VersionHistory';
import { CommentsSheet } from '../../../src/components/editor/CommentsSheet';
import { PageSetupDialog } from '../../../src/components/editor/PageSetupDialog';
import { ExportPdfDialog } from '../../../src/components/editor/ExportPdfDialog';
import { MiniPlayer, type PlayRequest } from '../../../src/components/editor/MiniPlayer';
import { SheetTab, type SheetHandle } from '../../../src/components/sheet/SheetTab';
import { COMMENT_MARGIN_GAP, COMMENT_MARGIN_W, type CommentInfo } from '../../../src/editor/schema/comments';
import { GradientFill } from '../../../src/components/GradientBackground';
import { IconButton } from '../../../src/components/IconButton';
import { anchorBelow, promptText, showAlert, type DialogButton } from '../../../src/components/dialogs/dialogs';
import { courseCrumbs, useShellScreen } from '../../../src/components/shell/ShellContext';
import { setCommentMarginShown, useCommentMargin } from '../../../src/components/shell/commentMargin';
import type { ThemeColors } from '../../../src/constants/colors';
import { Layout } from '../../../src/constants/layout';
import { Typography } from '../../../src/constants/typography';
import { saveLabel, useDocumentSync } from '../../../src/hooks/useDocumentSync';
import { useItemMenu } from '../../../src/hooks/useItemMenu';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { useRecorderState, useRecordingFlow } from '../../../src/hooks/useRecorder';
import { RecordingPhoneBar, RecordingPhoneHeader } from '../../../src/components/recording/RecordingPhone';
import { useUndoToast } from '../../../src/hooks/useUndoToast';
import { useViewPrefs } from '../../../src/lib/viewPrefs';
import { saveDefaultPageSetup } from '../../../src/services/preferences.service';
import { notifyLibraryUpdated, useLibraryUpdates } from '../../../src/lib/cache';
import type { FileRow } from '../../../src/lib/cloudRows';
import {
  ensureTranscriptDocument,
  FIXED_TABS,
  getDocumentFile,
  openDocument,
  renameDocument,
  takeKeptTabs,
  type DocTab,
  type FixedTab,
} from '../../../src/services/document.service';
import { addTab, deleteTab, isAddedTab, listTabs, moveTab, renameTab, restoreTab, type TabInfo, type TabKind } from '../../../src/services/document-tabs.service';
import { getFolderBreadcrumbs, type Breadcrumb } from '../../../src/services/folder.service';
import { getNoteBySession } from '../../../src/services/note.service';
import { convertEarlierNoteOf } from '../../../src/services/legacyNotes';
import { getProject } from '../../../src/services/project.service';
import { getSession, renameSession } from '../../../src/services/session.service';
import { getUserSettings } from '../../../src/services/settings.service';
import { useAuth } from '../../../src/hooks/useAuth';
import { markOpened } from '../../../src/services/shelf.service';
import { getTranscriptBySession } from '../../../src/services/transcript.service';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { Note, Session } from '../../../src/types/database';
import { errorMessage } from '../../../src/utils/errors';
import type { ShelfItem } from '../../../src/utils/shelf';

/** A tab id from a link (`?tab=`): a fixed tab or an added one (step 4.7b). */
const isTab = (v: unknown): v is DocTab => typeof v === 'string' && ((FIXED_TABS as readonly string[]).includes(v) || isAddedTab(v));
const isFixedTab = (v: DocTab): v is FixedTab => (FIXED_TABS as readonly string[]).includes(v);

const HINTS: Record<FixedTab, string> = {
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
  // The document's language (step 4.7d: graphs write Spanish decimals with a comma): the lecture's, else the account's.
  const { session: auth } = useAuth();
  const userId = auth?.user.id;
  const [accountLanguage, setAccountLanguage] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    getUserSettings(userId)
      .then((s) => setAccountLanguage(s?.default_language ?? null))
      .catch(() => {});
  }, [userId]);
  const [note, setNote] = useState<Note | null>(null);
  // The lecture whose note lookup has finished: until then its Summary tab can't tell "no summary" from
  // "an earlier note not converted yet" (4.9), so it stays loading instead of flashing "No summary yet".
  const [noteCheckedFor, setNoteCheckedFor] = useState<string | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [chain, setChain] = useState<Breadcrumb[]>([]);
  const [tab, setTab] = useState<DocTab>(isTab(params.tab) ? params.tab : 'notes');
  const [tabState, setTabState] = useState<TabState>('loading');
  const isLecture = file?.kind === 'lecture';

  // The document's tabs (step 4.7b): a lecture's three first, then added ones; a plain document's from "Tab 1".
  const [tabs, setTabs] = useState<TabInfo[] | null>(null);
  // The list was read (or couldn't be): until then the tab's kind isn't known, so nothing is drawn in it.
  const [tabsKnown, setTabsKnown] = useState(false);
  // Tabs deleted on another device that an edit here kept (shown once).
  const [keptTabs, setKeptTabs] = useState<string[]>([]);
  const loadTabs = useCallback(async () => {
    if (!id || !file) return;
    const list = await listTabs(id, file.kind === 'lecture').catch(() => null);
    setTabsKnown(true);
    if (list) setTabs(list);
    const kept = await takeKeptTabs(id).catch(() => []);
    if (kept.length && list) setKeptTabs(kept.map((k) => list.find((t) => t.tab === k)?.title ?? 'A tab'));
  }, [id, file]);
  useEffect(() => {
    void loadTabs();
  }, [loadTabs]);
  // The open tab was deleted (here or on another device): the first tab instead.
  useEffect(() => {
    if (tabs && tabs.length > 0 && !tabs.some((t) => t.tab === tab)) setTab(tabs[0].tab);
  }, [tabs, tab]);

  // This lecture is recording (step 5.3): on the iPhone (and below 1024 px) the
  // recording screen of iphone-02 around My notes; the laptop has the strip.
  const live = useRecorderState();
  const recordingFlowState = useRecordingFlow();
  const recordingHere =
    !!id && ((live.lectureId === id && live.status !== 'idle') || recordingFlowState.saving?.lectureId === id);
  const recordingScreen = recordingHere && !wide;
  useEffect(() => {
    if (recordingScreen && tab !== 'notes') setTab('notes');
  }, [recordingScreen, tab]);

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
        setNoteCheckedFor(id);
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
  // A rename, a move or a synced change from another device (tabs too).
  useLibraryUpdates(() => {
    void load();
    void loadTabs();
  });

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
  const noteChecked = noteCheckedFor === id;
  const shownTab = useRef<string | null>(null);
  useEffect(() => {
    if (!kind || !id) return;
    let live = true;
    const key = `${id}:${tab}`;
    if (shownTab.current !== key) setTabState('loading');
    shownTab.current = key;
    // A lecture's Summary tab waits for its note lookup (it stays loading meanwhile).
    if (kind === 'lecture' && tab === 'summary' && !noteChecked) {
      setTabState('loading');
      return;
    }
    (async () => {
      // A lecture's Summary and Transcript may have nothing yet; every other tab is a document.
      if (kind !== 'lecture' || (tab !== 'summary' && tab !== 'transcript')) return 'document' as const;
      const opened = await openDocument(id, tab).catch(() => null);
      if (opened?.id) return 'document' as const;
      if (tab === 'summary') {
        if (!hasNote) return 'none' as const;
        // Step 4.9: the earlier note becomes this tab, once (never over a document that is there). The
        // card stays for when that can't be done now (e.g. offline before the note was ever read).
        const outcome = await convertEarlierNoteOf(id).catch(() => null);
        return outcome === 'converted' || outcome === 'exists' ? ('document' as const) : ('earlier' as const);
      }
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
  }, [kind, id, tab, hasNote, noteChecked, lectureStatus]);

  // The editor, one per tab; its autosave starts once it is ready. A
  // spreadsheet tab (step 4.7e) has the grid instead, with the same autosave.
  const editorRef = useRef<StudiplyEditorHandle>(null);
  const sheetRef = useRef<SheetHandle>(null);
  const isSheet = tabs?.find((t) => t.tab === tab)?.kind === 'sheet';
  const editorKey = `${id}:${tab}`;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const showEditor = !!file && tabState === 'document' && tabsKnown;
  const sync = useDocumentSync({
    fileId: showEditor ? id : undefined,
    tab,
    editor: isSheet ? sheetRef : editorRef,
    editorReady: showEditor && readyKey === editorKey,
  });
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

  // Tabs (step 4.7b): add, rename, move, delete with Undo. The list is read again after each change.
  const failed = (what: string) => (err: unknown) => showAlert(what, errorMessage(err, 'Please try again.'));
  const askTabName = (title: string, current: string) => promptText(title, { defaultValue: current, confirmLabel: 'Save', placeholder: 'Tab name' });
  const onAddTab = async (kind: TabKind | null) => {
    if (!file) return;
    try {
      const added = await addTab(file.id, { isLecture, ...(kind ? { kind } : {}) });
      await loadTabs();
      setTab(added.tab);
      // Its name, ready to type over (Enter keeps "Tab N").
      const name = await askTabName('Name the tab', added.title);
      if (name && name !== added.title) {
        await renameTab(file.id, added.tab, name, isLecture);
        await loadTabs();
      }
    } catch (err) {
      failed('Could not add the tab')(err);
    }
  };
  const onRenameTab = async (t: TabInfo) => {
    if (!file) return;
    const name = await askTabName('Rename tab', t.title);
    if (!name || name === t.title) return;
    await renameTab(file.id, t.tab, name, isLecture).then(loadTabs, failed('Could not rename the tab'));
  };
  const onMoveTab = async (t: TabInfo, toIndex: number) => {
    if (!file) return;
    await moveTab(file.id, t.tab, toIndex, isLecture).then(loadTabs, failed('Could not move the tab'));
  };
  const onDeleteTab = async (t: TabInfo) => {
    if (!file) return;
    try {
      await deleteTab(file.id, t.tab, isLecture);
      await loadTabs();
      showUndo(`Deleted "${t.title}"`, () => {
        void restoreTab(file.id, t.tab).then(loadTabs, failed('Could not bring the tab back'));
      });
    } catch (err) {
      failed('Could not delete the tab')(err);
    }
  };

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
  // Page setup (after test D): saved on the document; both devices.
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  // Export PDF… (step 4.8a): this tab or all, with the page setup; the open tab as it is now (unsaved edits too).
  const [exportOpen, setExportOpen] = useState(false);
  const docLanguage = session?.language && session.language !== 'auto' ? session.language : accountLanguage;
  const loadTabContent = async (t: TabInfo): Promise<DocJSON> => {
    if (t.tab === tab && showEditor) {
      const now = await (isSheet ? sheetRef.current?.getJSON() : editorRef.current?.getJSON());
      if (now) return now;
    }
    return (await openDocument(id, t.tab)).content;
  };
  // A tap on a timestamp chip plays the lecture's recording from there (step 4.6).
  const [play, setPlay] = useState<PlayRequest | null>(null);
  const menuButton = useRef<View>(null);
  const openMenu = async () => {
    if (!item) return;
    editorRef.current?.blur();
    const extra: DialogButton[] = showEditor && isSheet
      ? // A spreadsheet tab (step 4.7e): no comments, page setup or print layout yet; its PDF is a table of values (4.8a).
        [
          { text: 'Version history', icon: 'time-outline', section: 'Review', onPress: () => setHistoryOpen(true) },
          { text: 'Export PDF…', icon: 'download-outline', section: 'Page', onPress: () => setExportOpen(true) },
        ]
      : showEditor
      ? [
          // Headings on the laptop (the simplicity pass before 4.6): Review · Page, then Document (ending with Delete).
          { text: 'Comments', icon: 'chatbox-ellipses-outline', section: 'Review', onPress: () => void openComments() },
          { text: 'Version history', icon: 'time-outline', onPress: () => setHistoryOpen(true) },
          // Writing tools (step 4.7); on the laptop also ⌘F, ⌘⇧H and ⌘⌥A, and the word count's line under the page.
          { text: 'Find and replace', icon: 'search-outline', section: 'Tools', onPress: () => editorRef.current?.tool('replace') },
          { text: 'Outline', icon: 'list-outline', onPress: () => editorRef.current?.tool('outline') },
          { text: 'Word count', icon: 'stats-chart-outline', onPress: () => editorRef.current?.tool('wordCount') },
          { text: 'Page setup…', icon: 'document-text-outline', section: 'Page', onPress: () => setPageSetupOpen(true) },
          { text: 'Export PDF…', icon: 'download-outline', onPress: () => setExportOpen(true) },
          ...(Platform.OS !== 'web'
            ? [{ text: phoneView?.pages ? 'Print layout ✓' : 'Print layout', icon: 'document-outline' as const, onPress: () => setPhoneView({ pages: !phoneView?.pages }) }]
            : []),
        ]
      : [];
    // With a document open, Export PDF… (4.8a) takes the place of the lecture's earlier-notes export (still in the library's menu).
    itemMenu.open(item, await anchorBelow(menuButton), { skip: showEditor ? ['open', 'export'] : ['open'], dialogRename: true, extra, section: showEditor ? 'Document' : undefined });
  };

  const meta = file ? `${courseName ?? 'My library'} · ${isLecture ? 'Lecture' : 'Document'} · ${metaDate(file.created_at)}` : '';
  // The iPhone's editor is a WebView under the header, so the header keeps its own margins there.
  const nativeEditor = Platform.OS !== 'web';
  const makeHeader = (inset: boolean, onCard = false) =>
    file ? (
      <DocumentHeader
        title={file.title}
        meta={meta}
        onRename={rename}
        selectTitle={created}
        compact={!wide}
        inset={inset}
        // Pages (laptop) and Print layout (iPhone) put it on the gradient, above the pages (step 4.5b); a sheet's is on its card.
        onGradient={!onCard && (wide ? margin.pages : nativeEditor && !!phoneView?.pages)}
      />
    ) : null;

  const lostNotice =
    sync.state.lost.length > 0 ? (
      <Pressable onPress={sync.clearLost} style={styles.notice} accessibilityRole="button">
        <Text style={styles.noticeText}>
          A newer change from another device was kept. Yours is in version history.
        </Text>
        <Ionicons name="close" size={16} color={PAGE_COLORS.text.secondary} />
      </Pressable>
    ) : null;

  // A tab deleted on another device and edited here is kept (step 4.7b): said once.
  const keptNames = [...keptTabs, ...(sync.state.kept ? [tabs?.find((t) => t.tab === tab)?.title ?? 'This tab'] : [])];
  const keptNotice =
    keptNames.length > 0 ? (
      <Pressable
        onPress={() => {
          setKeptTabs([]);
          sync.clearKept();
        }}
        style={styles.notice}
        accessibilityRole="button"
      >
        <Text style={styles.noticeText}>
          {keptNames.length === 1 ? `“${keptNames[0]}” was deleted on another device` : `${keptNames.length} tabs were deleted on another device`} and kept, because
          {keptNames.length === 1 ? ' it was' : ' they were'} edited here.
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
          text={`${(note.summary ?? '').slice(0, 320)}${(note.summary ?? '').length > 320 ? '…' : ''}\n\nThese notes become this tab the next time it opens and they can be saved. Until then they open in the notes view, with Clarify, Edit and Export PDF.`}
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
  ) : showEditor && isSheet ? (
    // A spreadsheet tab (step 4.7e): a white card with the title, the formula bar and the grid, which scrolls inside it.
    <View style={[styles.editorWrap, wide ? styles.sheetCard : styles.pageCard]}>
      {keptNotice}
      {lostNotice}
      <SheetTab
        key={editorKey}
        ref={sheetRef}
        compact={!wide}
        header={<View style={wide ? styles.sheetHeader : styles.sheetHeaderCompact}>{makeHeader(false, true)}</View>}
        onReady={() => setReadyKey(editorKey)}
        onChange={sync.onChange}
      />
    </View>
  ) : showEditor ? (
    // Print layout: no white card; the pages sit on the gradient (step 4.5b).
    <View style={[styles.editorWrap, !wide && nativeEditor && (recordingScreen || !phoneView?.pages) && styles.pageCard]}>
      {keptNotice}
      {lostNotice}
      <StudiplyEditor
        key={editorKey}
        ref={editorRef}
        fileId={id}
        // The recording screen (iphone-02): the title is in its header above; here only "MY NOTES".
        header={
          recordingScreen ? (
            <Text style={[styles.notesLabel, nativeEditor && styles.notesLabelInset]} {...{ dataSet: { recording: 'notes-label' } }}>
              MY NOTES
            </Text>
          ) : (
            makeHeader(nativeEditor)
          )
        }
        plain={recordingScreen}
        commentRoom={commentRoom}
        onCommentMargin={setCommentMarginShown}
        onReady={() => setReadyKey(editorKey)}
        onChange={sync.onChange}
        // While recording, My notes is pageless (Print layout stays as the student set it for later).
        view={nativeEditor ? (recordingScreen && phoneView ? { ...phoneView, pages: false } : phoneView) : undefined}
        pageSetup={sync.pageSetup}
        onChipPress={(ms) => setPlay({ ms, id: Date.now() })}
        language={docLanguage}
        footer={
          play ? <MiniPlayer lectureId={isLecture ? id : null} recording={lectureStatus === 'recording'} request={play} onClose={() => setPlay(null)} /> : null
        }
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

  const tabRow = (compact: boolean) =>
    tabs ? (
      <DocumentTabs
        tabs={tabs}
        current={tab}
        compact={compact}
        onSelect={setTab}
        onAdd={(kind) => void onAddTab(kind)}
        onRename={(t) => void onRenameTab(t)}
        onDelete={(t) => void onDeleteTab(t)}
        onMove={(t, to) => void onMoveTab(t, to)}
      />
    ) : null;

  const top = wide ? (
    <View style={styles.topRow}>
      {tabRow(false)}
      {isLecture && isFixedTab(tab) && (
        <Text style={styles.hint} numberOfLines={1}>
          {HINTS[tab]}
        </Text>
      )}
      <View style={styles.spacer} />
      <View ref={menuButton} collapsable={false}>
        <IconButton icon="ellipsis-horizontal" label="Document menu" onPress={openMenu} color={c.text.onGradientStrong} />
      </View>
    </View>
  ) : recordingScreen ? (
    <View onStartShouldSetResponder={() => true} onResponderRelease={() => editorRef.current?.blur()} style={[styles.phoneTop, { paddingTop: insets.top + 6 }]}>
      <RecordingPhoneHeader
        backLabel={courseName ?? 'Library'}
        backColor={backColor}
        onBack={leave}
        crumbs={chain.length ? chain.map((b) => b.name).join(' › ') : (courseName ?? 'My library')}
        title={file?.title ?? ''}
      />
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
      {tabRow(true)}
    </View>
  );

  const fullPane = margin.pages || (showEditor && isSheet);

  // One tree for both layouts, so crossing the laptop width (a window being
  // resized) keeps the editor and its save session instead of remounting them.
  return (
    <View style={styles.container}>
      <GradientFill />
      {!wide && <ThemedStatusBar />}
      {/* In Pages (step 4.5b) and on a spreadsheet tab (4.7e) the page area has the whole pane; the tabs row keeps its column. */}
      <View style={wide ? (fullPane ? styles.columnPages : [styles.column, margin.shown && commentRoom && styles.columnWithMargin]) : styles.container}>
        {wide && fullPane ? <View style={styles.topRowPages}>{top}</View> : top}
        <View style={wide ? styles.container : [styles.phoneBody, { paddingBottom: insets.bottom + 8 }]}>
          {body}
          {recordingScreen && <RecordingPhoneBar />}
        </View>
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
      <PageSetupDialog
        visible={pageSetupOpen}
        setup={sync.pageSetup}
        pageless={wide ? !margin.pages : !phoneView?.pages}
        onClose={() => setPageSetupOpen(false)}
        onApply={(setup) => void sync.setPageSetup(setup).catch((err) => showAlert('Could not save the page setup', errorMessage(err, 'Please try again.')))}
        onSetDefault={saveDefaultPageSetup}
      />
      {file && tabs && (
        <ExportPdfDialog
          visible={exportOpen}
          onClose={() => setExportOpen(false)}
          title={file.title}
          tabs={tabs}
          current={tab}
          setup={sync.pageSetup}
          language={docLanguage}
          loadTab={loadTabContent}
        />
      )}
      {file && (
        <VersionHistory
          visible={historyOpen}
          fileId={file.id}
          tab={tab}
          tabName={tabs && tabs.length > 1 ? tabs.find((t) => t.tab === tab)?.title : undefined}
          sheet={isSheet}
          onClose={() => setHistoryOpen(false)}
          onRestore={sync.restore}
        />
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    column: { flex: 1, width: '100%', maxWidth: Layout.documentMaxWidth + 48, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, gap: 12 },
    columnWithMargin: { maxWidth: Layout.documentMaxWidth + 48 + COMMENT_MARGIN_GAP + COMMENT_MARGIN_W },
    columnPages: { flex: 1, width: '100%', paddingTop: 16, gap: 12 },
    topRowPages: { width: '100%', maxWidth: Layout.documentMaxWidth + 48, alignSelf: 'center', paddingHorizontal: 24 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
    hint: { flexShrink: 1, fontSize: Typography.size.sm, color: c.text.onGradient },
    spacer: { flex: 1 },
    editorWrap: { flex: 1 },
    page: { flex: 1, borderRadius: Layout.cardRadius.laptop, backgroundColor: PAGE_COLORS.card },
    pageContent: { paddingHorizontal: 60, paddingTop: 44, paddingBottom: 60 },
    pageContentCompact: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24 },
    pageCard: { flex: 1, borderRadius: Layout.cardRadius.iphone, overflow: 'hidden', backgroundColor: PAGE_COLORS.card },
    sheetCard: { flex: 1, marginHorizontal: 24, marginBottom: 24, borderRadius: Layout.cardRadius.laptop, overflow: 'hidden', backgroundColor: PAGE_COLORS.card },
    sheetHeader: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 6 },
    sheetHeaderCompact: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
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
    notesLabel: {
      marginBottom: 10,
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.bold,
      letterSpacing: Typography.tracking.wider,
      color: PAGE_COLORS.text.secondary,
    },
    notesLabelInset: { marginHorizontal: 16, marginTop: 14 },
  });
