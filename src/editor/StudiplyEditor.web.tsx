import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';

import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { studiplyExtensions } from './bridges';
import { editorCss } from './editorCss';
import { selectedChipMs } from './schema/timestampChip';
import { EMPTY_DOC, type DocJSON, type StudiplyEditorHandle, type StudiplyEditorProps } from './types';

const SCOPE = 'studiply-editor';

type Tool = { label: string; name: string; attrs?: Record<string, unknown>; run: (e: Editor) => void };

/** The spike's minimal toolbar; the full one (styles, fonts, colours, Cmd shortcuts listed) is step 4.4. */
const TOOLS: Tool[] = [
  { label: 'H1', name: 'heading', attrs: { level: 1 }, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'H2', name: 'heading', attrs: { level: 2 }, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'B', name: 'bold', run: (e) => e.chain().focus().toggleBold().run() },
  { label: 'I', name: 'italic', run: (e) => e.chain().focus().toggleItalic().run() },
  { label: 'U', name: 'underline', run: (e) => e.chain().focus().toggleUnderline().run() },
  { label: '• List', name: 'bulletList', run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: '1. List', name: 'orderedList', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Undo', name: '', run: (e) => e.chain().focus().undo().run() },
  { label: 'Redo', name: '', run: (e) => e.chain().focus().redo().run() },
];

/**
 * The laptop editor (step 4.2): Tiptap directly in the page (real browser
 * paste and shortcuts, no iframe), with the same extensions TenTap's WebView
 * builds on the iPhone, so both read and write the same JSON.
 */
const StudiplyEditor = forwardRef<StudiplyEditorHandle, StudiplyEditorProps>(function StudiplyEditor(
  { initialContent, onReady, onChipPress, onPaste, onTyping },
  ref,
) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const extensions = useMemo(() => studiplyExtensions(), []);
  const keyAt = useRef(0);
  const lastChip = useRef<number | null>(null);
  const lastPaste = useRef(0);

  // Callbacks change between renders; the editor reads the latest.
  const handlers = useRef({ onReady, onChipPress, onPaste, onTyping });
  handlers.current = { onReady, onChipPress, onPaste, onTyping };

  const editor = useEditor({
    extensions,
    content: initialContent ?? EMPTY_DOC,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    editorProps: {
      handleDOMEvents: {
        keydown: () => {
          keyAt.current = performance.now();
          return false;
        },
      },
    },
    onCreate: () => handlers.current.onReady?.(),
    onUpdate: ({ editor: e }) => {
      if (keyAt.current) {
        const at = keyAt.current;
        keyAt.current = 0;
        requestAnimationFrame(() => handlers.current.onTyping?.(performance.now() - at));
      }
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

  useImperativeHandle(
    ref,
    () => ({
      getJSON: async () => editor.getJSON() as DocJSON,
      getText: async () => editor.getText(),
      setContent: (doc) => editor.commands.setContent(doc),
      insertTimestampChip: (ms) => editor.chain().focus().insertTimestampChip(ms).run(),
    }),
    [editor],
  );

  const css = useMemo(() => editorCss(colors, `.${SCOPE}`), [colors]);

  return (
    <View style={styles.container}>
      <style>{css}</style>
      <View style={styles.toolbar} accessibilityRole="toolbar">
        {TOOLS.map((tool) => {
          const active = !!tool.name && editor.isActive(tool.name, tool.attrs);
          return (
            <Pressable
              key={tool.label}
              onPress={() => tool.run(editor)}
              style={[styles.tool, active && styles.toolActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.toolText, active && styles.toolTextActive]}>{tool.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.page}>
        <EditorContent editor={editor} className={SCOPE} />
      </View>
    </View>
  );
});

export default StudiplyEditor;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.card, borderRadius: 12, overflow: 'hidden' },
    toolbar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      padding: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    tool: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    toolActive: { backgroundColor: c.accentLight },
    toolText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    toolTextActive: { color: c.accentDark },
    page: { flex: 1, overflow: 'scroll' as 'hidden' },
  });
