import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import {
  darkEditorTheme,
  defaultEditorTheme,
  RichText,
  Toolbar,
  useBridgeState,
  useEditorBridge,
  type EditorBridge,
} from '@10play/tentap-editor';

import { editorHtml } from '../../editor-web/build/editorHtml';
import { useTheme } from '../theme/ThemeProvider';
import { studiplyBridges } from './bridges';
import type { PasteReportState } from './bridges/pasteReport';
import type { TimestampChipInstance, TimestampChipState } from './bridges/timestampChip';
import { editorCss } from './editorCss';
import type { DocJSON, StudiplyEditorHandle, StudiplyEditorProps } from './types';

type Bridge = EditorBridge & TimestampChipInstance;
type State = ReturnType<typeof useBridgeState> & Partial<TimestampChipState & PasteReportState>;

const CSS_TAG = 'studiply';

/**
 * The iPhone editor (step 4.2): TenTap's WebView running editor-web's bundle
 * (Studiply's bridges, so the schema is the laptop's), with TenTap's toolbar
 * above the keyboard. Needs the development build (react-native-webview).
 */
const StudiplyEditor = forwardRef<StudiplyEditorHandle, StudiplyEditorProps>(function StudiplyEditor(
  { initialContent, onReady, onChipPress, onPaste },
  ref,
) {
  const { colors, scheme } = useTheme();
  const editor = useEditorBridge({
    bridgeExtensions: studiplyBridges,
    customSource: editorHtml,
    initialContent,
    avoidIosKeyboard: true,
    theme: scheme === 'dark' ? darkEditorTheme : defaultEditorTheme,
  }) as Bridge;
  const state = useBridgeState(editor) as State;

  useImperativeHandle(
    ref,
    () => ({
      getJSON: async () => (await editor.getJSON()) as DocJSON,
      getText: () => editor.getText(),
      setContent: (doc) => editor.setContent(doc),
      insertTimestampChip: (ms) => editor.insertTimestampChip(ms),
    }),
    [editor],
  );

  // The document's look follows the app's appearance.
  useEffect(() => {
    if (state.isReady) editor.injectCSS(editorCss(colors), CSS_TAG);
  }, [state.isReady, colors, editor]);

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

  return (
    <View style={styles.container}>
      <RichText editor={editor} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.toolbar}>
        <Toolbar editor={editor} />
      </KeyboardAvoidingView>
    </View>
  );
});

export default StudiplyEditor;

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { position: 'absolute', width: '100%', bottom: 0 },
});
