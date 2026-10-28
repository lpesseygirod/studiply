import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
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
import type { TimestampChipInstance, TimestampChipState } from './bridges/timestampChip';
import { editorCss, PAGE_COLORS } from './editorCss';
import { cleanUrl, type FormatCommand } from './format';
import { promptText, showAlert } from '../components/dialogs/dialogs';
import { AA_PANEL, AaKeyboard, COLOR_PANEL, ColorKeyboard } from './iphone/FormatPanels';
import { KeyboardToolbar, type Panel } from './iphone/KeyboardToolbar';
import { INSERT_PANEL, InsertKeyboard, PanelActions, TABLE_PANEL, TableKeyboard } from './iphone/InsertPanels';
import type { DocJSON, StudiplyEditorHandle, StudiplyEditorProps } from './types';

type Bridge = EditorBridge & TimestampChipInstance & BlockMetaInstance & FormatBridgeInstance;
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
  { initialContent, editable = true, header, onReady, onChange, onChipPress, onPaste },
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
  const { isKeyboardUp } = useKeyboard();
  const [panel, setPanel] = useState<string | undefined>(undefined);
  // The toolbar shows while typing, and over the Aa / colour panels.
  const typing = isKeyboardUp && (state.isFocused || panel !== undefined);
  const run = useCallback((cmd: FormatCommand) => editor.format(cmd), [editor]);
  const openPanel = (which: Panel) => setPanel((open) => (open === PANEL_IDS[which] ? undefined : PANEL_IDS[which]));
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
  const panelActions = { addLink: () => void addLink() };

  useImperativeHandle(
    ref,
    () => ({
      getJSON: async () => (await editor.getJSON()) as DocJSON,
      getText: () => editor.getText(),
      loadDoc: (doc) => editor.loadDoc(doc),
      applyBlocks: (doc) => editor.applyBlocks(doc),
      insertTimestampChip: (ms) => editor.insertTimestampChip(ms),
      focus: () => editor.focus(),
      blur: () => editor.blur(),
    }),
    [editor],
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
        />
      )}
      <PanelActions.Provider value={panelActions}>
        <CustomKeyboard editor={editor} keyboards={PANELS} activeKeyboardID={panel} setActiveKeyboardID={setPanel} rootBackground={colors.cardMuted} />
      </PanelActions.Provider>
    </EditorKeyboardAvoidingView>
  );
});

export default StudiplyEditor;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
  });
