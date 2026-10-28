import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  darkEditorTheme,
  defaultEditorTheme,
  EditorKeyboardAvoidingView,
  RichText,
  Toolbar,
  useBridgeState,
  useEditorBridge,
  useKeyboard,
  type EditorBridge,
  type EditorTheme,
} from '@10play/tentap-editor';

import { editorHtml } from '../../editor-web/build/editorHtml';
import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { studiplyBridges } from './bridges';
import type { PasteReportState } from './bridges/pasteReport';
import type { BlockMetaInstance } from './bridges/blockMeta';
import type { TimestampChipInstance, TimestampChipState } from './bridges/timestampChip';
import { editorCss, PAGE_COLORS } from './editorCss';
import type { DocJSON, StudiplyEditorHandle, StudiplyEditorProps } from './types';

type Bridge = EditorBridge & TimestampChipInstance & BlockMetaInstance;
type State = ReturnType<typeof useBridgeState> & Partial<TimestampChipState & PasteReportState>;

const CSS_TAG = 'studiply';
const CSS = editorCss();

// The page is always white (editorCss); the toolbar follows the app.
const PAGE = [defaultEditorTheme.webview, { backgroundColor: PAGE_COLORS.card }];
const LIGHT_THEME: EditorTheme = { ...defaultEditorTheme, webview: PAGE };
const DARK_THEME: EditorTheme = { ...darkEditorTheme, webview: PAGE };

/**
 * The iPhone editor (step 4.2): TenTap's WebView running editor-web's bundle
 * (Studiply's bridges, so the schema is the laptop's), with TenTap's toolbar
 * and a Done button on the keyboard. Needs the development build
 * (react-native-webview).
 */
const StudiplyEditor = forwardRef<StudiplyEditorHandle, StudiplyEditorProps>(function StudiplyEditor(
  { initialContent, editable = true, header, onReady, onChange, onChipPress, onPaste },
  ref,
) {
  const { scheme } = useTheme();
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
  // Toolbar's own rule for showing itself; Done shows with it.
  const typing = isKeyboardUp && state.isFocused;

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
      <View style={styles.bar}>
        <View style={styles.container}>
          <Toolbar editor={editor} />
        </View>
        {typing && (
          <Pressable
            onPress={() => editor.blur()}
            style={[styles.done, { backgroundColor: StyleSheet.flatten(editor.theme.toolbar.toolbarBody).backgroundColor }]}
            accessibilityRole="button"
            accessibilityLabel="Hide keyboard"
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        )}
      </View>
    </EditorKeyboardAvoidingView>
  );
});

export default StudiplyEditor;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    bar: { flexDirection: 'row' },
    // As tall as TenTap's toolbar (44), so the caret stays above both.
    done: {
      height: 44,
      paddingHorizontal: 14,
      justifyContent: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    doneText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.accentDark },
  });
