import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  darkEditorTheme,
  defaultEditorTheme,
  CustomKeyboard,
  EditorKeyboardAvoidingView,
  RichText,
  useBridgeState,
  useEditorBridge,
  useKeyboard,
  type EditorBridge,
  type EditorTheme,
} from '@10play/tentap-editor';

import { editorHtml } from '../../editor-web/build/editorHtml';
import type { ThemeColors } from '../constants/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { studiplyBridges } from './bridges';
import type { PasteReportState } from './bridges/pasteReport';
import type { BlockMetaInstance } from './bridges/blockMeta';
import type { FormatBridgeInstance, FormatBridgeState } from './bridges/format';
import { setNativePhotoResolver, type PhotoBridgeInstance } from './bridges/photo';
import type { TimestampChipInstance, TimestampChipState } from './bridges/timestampChip';
import { editorCss, PAGE_COLORS } from './editorCss';
import { cleanUrl, type FormatCommand, type TableAction } from './format';
import { promptText, showActionSheet, showAlert } from '../components/dialogs/dialogs';
import { AA_PANEL, AaKeyboard, COLOR_PANEL, ColorKeyboard } from './iphone/FormatPanels';
import { KeyboardToolbar, type Panel } from './iphone/KeyboardToolbar';
import { FormulaSheet, type FormulaDraft } from './iphone/FormulaSheet';
import { INSERT_PANEL, InsertKeyboard, PanelActions, TABLE_PANEL, TableKeyboard, type PanelActionsValue, type TableSize, type TableView } from './iphone/InsertPanels';
import type { DocJSON, StudiplyEditorHandle, StudiplyEditorProps } from './types';
import { addDocPhoto, editorPhotoSource } from '../services/doc-photo.service';
import { newId } from '../lib/mappers';
import type { CommentInfo } from './schema/comments';
import { requestCameraPermission, requestMediaLibraryPermission } from '../utils/permissions';

type Bridge = EditorBridge & TimestampChipInstance & BlockMetaInstance & FormatBridgeInstance & PhotoBridgeInstance;

// The WebView's photos (`media:<id>`): the phone's copy, or a signed link (then kept on the phone).
setNativePhotoResolver(editorPhotoSource);
type State = ReturnType<typeof useBridgeState> & Partial<TimestampChipState & PasteReportState & FormatBridgeState>;

const PANELS = [AaKeyboard, ColorKeyboard, InsertKeyboard, TableKeyboard];
const PANEL_IDS: Record<Panel, string> = { aa: AA_PANEL, colors: COLOR_PANEL, insert: INSERT_PANEL, table: TABLE_PANEL };
const panelOf = (id: string | undefined) => (Object.keys(PANEL_IDS) as Panel[]).find((k) => PANEL_IDS[k] === id);

const CSS_TAG = 'studiply';
const CSS = editorCss();

// The page is always white (editorCss); the toolbar follows the app.
const PAGE = [defaultEditorTheme.webview, { backgroundColor: PAGE_COLORS.card }];
const LIGHT_THEME: EditorTheme = { ...defaultEditorTheme, webview: PAGE };
const DARK_THEME: EditorTheme = { ...darkEditorTheme, webview: PAGE };

/**
 * The iPhone editor (step 4.2): TenTap's WebView running editor-web's bundle
 * (Studiply's bridges, so the schema is the laptop's). On the keyboard,
 * Studiply's toolbar with Done (step 4.4); Aa and the colours open their
 * panels in place of the keyboard (TenTap's CustomKeyboard), as in Google
 * Docs. Needs the development build (react-native-webview).
 */
const StudiplyEditor = forwardRef<StudiplyEditorHandle, StudiplyEditorProps>(function StudiplyEditor(
  { initialContent, fileId, editable = true, header, onReady, onChange, onChipPress, onPaste },
  ref,
) {
  const { scheme, colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const editor = useEditorBridge({
    bridgeExtensions: studiplyBridges,
    customSource: editorHtml,
    initialContent,
    avoidIosKeyboard: true,
    editable,
    theme: scheme === 'dark' ? DARK_THEME : LIGHT_THEME,
  }) as Bridge;
  const state = useBridgeState(editor) as State;
  // The latest state, for the screen's calls (the comments list).
  const stateRef = useRef(state);
  stateRef.current = state;
  const { isKeyboardUp } = useKeyboard();
  const [panel, setPanel] = useState<string | undefined>(undefined);
  // The panels' state a prompt must not lose (step 4.5): kept here, not in the panel.
  const [insertSize, setInsertSize] = useState<TableSize | null>(null);
  const [tableView, setTableView] = useState<TableView>('list');
  const [resize, setResize] = useState<TableSize | null>(null);
  // The formula sheet (step 4.5); `placed`: the formula is in the text (and selected there).
  const [formula, setFormula] = useState<FormulaDraft | null>(null);
  const formulaPlaced = useRef(false);
  // The toolbar shows while typing, and over the Aa / colour panels.
  const typing = isKeyboardUp && (state.isFocused || panel !== undefined);
  const run = useCallback((cmd: FormatCommand) => editor.format(cmd), [editor]);
  const openPanel = (which: Panel) => {
    // From the toolbar, + and Table start fresh (a prompt in them keeps their state meanwhile).
    if (which === 'insert') setInsertSize(null);
    if (which === 'table') {
      setTableView('list');
      setResize(null);
    }
    setPanel((open) => (open === PANEL_IDS[which] ? undefined : PANEL_IDS[which]));
  };
  const done = () => {
    setPanel(undefined);
    editor.blur();
  };
  const addLink = async () => {
    const current = state.format?.link ?? null;
    const value = await promptText(current ? 'Edit link' : 'Add link', {
      defaultValue: current?.replace(/^mailto:/, '') ?? '',
      placeholder: 'Address (e.g. uned.es)',
      confirmLabel: 'Apply',
    });
    if (!value) return;
    const href = cleanUrl(value);
    if (!href) showAlert('Not a link', "That isn't an address a link can open.");
    else run({ type: 'link', href });
  };
  const askNumber = async (title: string, value: number, max: number) => {
    const typed = await promptText(title, { message: `A number from 1 to ${max}.`, defaultValue: String(value), confirmLabel: 'OK', keyboard: 'number-pad' });
    // Back to the panel the prompt came from.
    editor.focus();
    const n = Number(typed?.replace(/\D/g, '') ?? '');
    if (!n) return null;
    return { value: Math.min(n, max), lowered: n > max };
  };
  // "+" → Photo (several) or Take photo: each is kept on the phone and queued, then all go in where the cursor was.
  const addPhotos = async (from: 'library' | 'camera') => {
    setPanel(undefined);
    if (!fileId || !(await (from === 'camera' ? requestCameraPermission() : requestMediaLibraryPermission()))) return;
    let assets: ImagePicker.ImagePickerAsset[];
    try {
      const options = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 };
      const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true });
      if (result.canceled) return;
      assets = result.assets;
    } catch {
      showAlert('Error', from === 'camera' ? 'Could not take the photo. Please try again.' : 'Could not pick photos. Please try again.');
      return;
    }
    const ids: string[] = [];
    for (const a of assets) {
      try {
        ids.push(
          await addDocPhoto(fileId, {
            uri: a.uri,
            name: a.fileName ?? null,
            mimeType: a.mimeType ?? 'image/jpeg',
            sizeBytes: a.fileSize ?? null,
            size: { width: a.width, height: a.height },
          }),
        );
      } catch (err) {
        showAlert('Could not add the photo', err instanceof Error ? err.message : 'Please try again.');
      }
    }
    if (ids.length) editor.insertPhotos(ids);
  };
  const openFormula = (current: { latex: string; display: boolean } | null) => {
    setPanel(undefined);
    formulaPlaced.current = !!current;
    setFormula(current ? { ...current, existing: true } : { latex: '', display: false, existing: false });
  };
  const changeFormula = (latex: string, display: boolean) => {
    setFormula((f) => f && { ...f, latex, display });
    // Nothing goes in until there is something to show; then the text is the preview.
    if (!latex.trim() && !formulaPlaced.current) return;
    formulaPlaced.current = true;
    run({ type: 'formula', action: 'set', latex, display });
  };
  const closeFormula = (action: 'done' | 'remove') => {
    setFormula(null);
    if (formulaPlaced.current) run({ type: 'formula', action });
    formulaPlaced.current = false;
    editor.focus();
  };
  // Comments (step 4.5): + → Comment on the selected words, through the app's prompt.
  const addComment = async () => {
    setPanel(undefined);
    if (!stateRef.current.format?.canComment) {
      showAlert('Select some words first', 'Select the words the comment is about, then add it.');
      return;
    }
    const text = await promptText('Add comment', { placeholder: 'Comment', confirmLabel: 'Comment' });
    if (text?.trim()) run({ type: 'comment', action: 'add', id: newId(), text: text.trim() });
  };
  // The keyboard toolbar's Comment (the cursor in commented words): that comment's card, as a sheet.
  const openComment = (c: CommentInfo) => {
    showActionSheet(
      `“${c.quote}”`,
      [
        {
          text: 'Edit',
          onPress: () =>
            void promptText('Edit comment', { defaultValue: c.text, confirmLabel: 'Save' }).then((text) => {
              if (text?.trim()) run({ type: 'comment', action: 'edit', id: c.id, text: text.trim() });
            }),
        },
        { text: c.resolved ? 'Reopen' : 'Resolve', onPress: () => run({ type: 'comment', action: 'resolve', id: c.id, resolved: !c.resolved }) },
        { text: 'Delete', style: 'destructive', onPress: () => run({ type: 'comment', action: 'delete', id: c.id }) },
      ],
      { message: c.text },
    );
  };
  // The keyboard toolbar's Layout (a photo is selected): as in Pages, then alignment for Break text.
  const openPhotoLayout = () => {
    const p = stateRef.current.format?.photo;
    if (!p) return;
    const mark = (on: boolean, text: string) => (on ? `${text} ✓` : text);
    showActionSheet('Photo layout', [
      { text: mark(p.wrap === 'inline', 'In line with text'), onPress: () => run({ type: 'photoLayout', wrap: 'inline' }) },
      { text: mark(p.wrap === 'left', 'Wrap left'), onPress: () => run({ type: 'photoLayout', wrap: 'left' }) },
      { text: mark(p.wrap === 'right', 'Wrap right'), onPress: () => run({ type: 'photoLayout', wrap: 'right' }) },
      { text: mark(p.wrap === 'break', 'Break text'), onPress: () => run({ type: 'photoLayout', wrap: 'break' }) },
      ...(p.wrap === 'break'
        ? [
            { text: mark(p.align === 'left', 'Align left'), onPress: () => run({ type: 'photoLayout', align: 'left' }) },
            { text: mark(p.align === 'center', 'Centre'), onPress: () => run({ type: 'photoLayout', align: 'center' }) },
            { text: mark(p.align === 'right', 'Align right'), onPress: () => run({ type: 'photoLayout', align: 'right' }) },
          ]
        : []),
      { text: 'Delete photo', style: 'destructive' as const, onPress: () => run({ type: 'photoDelete' }) },
    ]);
  };
  const panelActions: PanelActionsValue = {
    addLink: () => void addLink(),
    addFormula: () => openFormula(null),
    addComment: () => void addComment(),
    addPhotos: fileId ? (from) => void addPhotos(from) : null,
    askNumber,
    insertSize,
    setInsertSize,
    tableView,
    setTableView,
    resize,
    setResize,
  };

  // The floating table bar (in the WebView) asks for a menu: Rows and
  // Columns as action sheets, Colour and Table size… in the table panel.
  const request = state.format?.tableRequest ?? null;
  const seenRequest = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const id = request?.id ?? null;
    // The first state seen may carry an old press (the screen came back): not a new one.
    if (seenRequest.current === undefined || id === seenRequest.current) {
      seenRequest.current = id;
      return;
    }
    seenRequest.current = id;
    const f = state.format;
    if (!request || !f) return;
    const act = (action: TableAction) => () => run({ type: 'table', action });
    const openTable = (view: TableView) => {
      setTableView(view);
      if (view === 'size') setResize({ rows: f.tableRows || 1, cols: f.tableCols || 1 });
      setPanel(TABLE_PANEL);
    };
    if (request.button === 'rows') {
      showActionSheet('Rows', [
        { text: 'Insert row above', onPress: act('rowAbove') },
        { text: 'Insert row below', onPress: act('rowBelow') },
        { text: 'Delete row', style: 'destructive', onPress: act('deleteRow') },
      ]);
    } else if (request.button === 'columns') {
      showActionSheet('Columns', [
        { text: 'Insert column left', onPress: act('columnLeft') },
        { text: 'Insert column right', onPress: act('columnRight') },
        { text: 'Delete column', style: 'destructive', onPress: act('deleteColumn') },
      ]);
    } else if (request.button === 'colour') {
      openTable('colour');
    } else {
      showActionSheet('Table', [
        { text: f.headerRow ? 'Turn off header row' : 'Header row', onPress: act('headerRow') },
        ...(f.canMerge ? [{ text: 'Merge cells', onPress: act('merge') }] : []),
        ...(f.canSplit ? [{ text: 'Split cell', onPress: act('split') }] : []),
        { text: `Table size… (${f.tableRows} × ${f.tableCols})`, onPress: () => openTable('size') },
      ]);
    }
    // Only a new press opens anything; the format state changes all the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  // Tapping a formula (in the WebView) opens the sheet on it.
  const formulaTap = state.format?.formulaRequest?.id ?? null;
  const seenFormulaTap = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    // The first state seen may carry an old tap (the screen came back): not a new one.
    if (seenFormulaTap.current === undefined || formulaTap === seenFormulaTap.current) {
      seenFormulaTap.current = formulaTap;
      return;
    }
    seenFormulaTap.current = formulaTap;
    const f = state.format?.formula;
    if (f) openFormula(f);
    // Only a new tap opens it; the format state changes all the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulaTap]);

  useImperativeHandle(
    ref,
    () => ({
      getJSON: async () => (await editor.getJSON()) as DocJSON,
      getText: () => editor.getText(),
      loadDoc: (doc) => editor.loadDoc(doc),
      applyBlocks: (doc) => editor.applyBlocks(doc),
      insertTimestampChip: (ms) => editor.insertTimestampChip(ms),
      comments: async () => stateRef.current.format?.comments ?? [],
      comment: (cmd) => run(cmd),
      focus: () => editor.focus(),
      blur: () => editor.blur(),
    }),
    [editor, run],
  );

  useEffect(() => {
    if (state.isReady) editor.injectCSS(CSS, CSS_TAG);
  }, [state.isReady, editor]);

  useEffect(() => {
    if (state.isReady) editor.setEditable(editable);
  }, [state.isReady, editable, editor]);

  // The WebView says when the student changed the document (not for
  // loadDoc / applyBlocks, which don't emit an update).
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => editor._subscribeToContentUpdate(() => changed.current?.()), [editor]);

  const readyOnce = useRef(false);
  useEffect(() => {
    if (state.isReady && !readyOnce.current) {
      readyOnce.current = true;
      onReady?.();
    }
  }, [state.isReady, onReady]);

  const lastChip = useRef<number | null>(null);
  useEffect(() => {
    const ms = state.selectedChipMs ?? null;
    if (ms !== null && ms !== lastChip.current) onChipPress?.(ms);
    lastChip.current = ms;
  }, [state.selectedChipMs, onChipPress]);

  const lastPaste = useRef(0);
  useEffect(() => {
    const report = state.lastPaste;
    if (report && report.id !== lastPaste.current) {
      lastPaste.current = report.id;
      onPaste?.(report);
    }
  }, [state.lastPaste, onPaste]);

  // EditorKeyboardAvoidingView measures itself in the window, so the toolbar
  // sits on the keyboard wherever the editor is on the screen (React Native's
  // KeyboardAvoidingView measures against its parent and left it under the
  // keyboard on the spike screen).
  return (
    <EditorKeyboardAvoidingView style={styles.container}>
      {/* The title and meta line make room for the text while typing. */}
      {!typing && header}
      <View style={styles.container}>
        <RichText editor={editor} />
      </View>
      {typing && editable && (
        <KeyboardToolbar
          state={state.format}
          run={run}
          panel={panelOf(panel)}
          onPanel={openPanel}
          onDone={done}
          onLink={addLink}
          onOpenLink={(href) => void Linking.openURL(href).catch(() => {})}
          onComment={openComment}
          onPhotoLayout={openPhotoLayout}
        />
      )}
      <PanelActions.Provider value={panelActions}>
        <CustomKeyboard editor={editor} keyboards={PANELS} activeKeyboardID={panel} setActiveKeyboardID={setPanel} rootBackground={colors.cardMuted} />
      </PanelActions.Provider>
      <FormulaSheet draft={formula} onChange={changeFormula} onDone={() => closeFormula('done')} onRemove={() => closeFormula('remove')} />
    </EditorKeyboardAvoidingView>
  );
});

export default StudiplyEditor;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
  });
