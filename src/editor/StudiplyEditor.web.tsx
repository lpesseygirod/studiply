import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';

import type { ThemeColors } from '../constants/colors';
import { Layout } from '../constants/layout';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { studiplyExtensions } from './bridges';
import { editorCss, PAGE_COLORS } from './editorCss';
import { selectedChipMs } from './schema/timestampChip';
import { EMPTY_DOC, type DocJSON, type StudiplyEditorHandle, type StudiplyEditorProps } from './types';

const SCOPE = 'studiply-editor';
// The page card gives the margins on the laptop; the text keeps room below.
const CSS = `${editorCss(`.${SCOPE}`)}
.${SCOPE} .ProseMirror { padding: 0 0 120px; min-height: 240px; outline: none; }
`;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Tool = { label: string; icon: IconName; name?: string; attrs?: Record<string, unknown>; run: (e: Editor) => void } | 'gap';

/** Today's basic tools in the mockup's toolbar card; the full toolbar (styles, font, size, colours…) is step 4.4. */
const TOOLS: Tool[] = [
  { label: 'Undo', icon: 'undo', run: (e) => e.chain().focus().undo().run() },
  { label: 'Redo', icon: 'redo', run: (e) => e.chain().focus().redo().run() },
  'gap',
  { label: 'Heading 1', icon: 'format-header-1', name: 'heading', attrs: { level: 1 }, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', icon: 'format-header-2', name: 'heading', attrs: { level: 2 }, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  'gap',
  { label: 'Bold', icon: 'format-bold', name: 'bold', run: (e) => e.chain().focus().toggleBold().run() },
  { label: 'Italic', icon: 'format-italic', name: 'italic', run: (e) => e.chain().focus().toggleItalic().run() },
  { label: 'Underline', icon: 'format-underline', name: 'underline', run: (e) => e.chain().focus().toggleUnderline().run() },
  { label: 'Strikethrough', icon: 'format-strikethrough-variant', name: 'strike', run: (e) => e.chain().focus().toggleStrike().run() },
  'gap',
  { label: 'Bulleted list', icon: 'format-list-bulleted', name: 'bulletList', run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', icon: 'format-list-numbered', name: 'orderedList', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Checklist', icon: 'format-list-checks', name: 'taskList', run: (e) => e.chain().focus().toggleTaskList().run() },
];

/**
 * The laptop editor: Tiptap directly in the page (real browser paste and
 * shortcuts, no iframe), with the same extensions TenTap's WebView builds on
 * the iPhone, so both read and write the same JSON. As in the mockup
 * (docs/design/desktop-01): a toolbar card, then the white page with the
 * screen's `header` (title and meta line) above the text.
 */
const StudiplyEditor = forwardRef<StudiplyEditorHandle, StudiplyEditorProps>(function StudiplyEditor(
  { initialContent, editable = true, header, onReady, onChange, onChipPress, onPaste },
  ref,
) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const narrow = useWindowDimensions().width < 600;
  const extensions = useMemo(() => studiplyExtensions(), []);
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
      focus: () => editor.commands.focus(),
      blur: () => editor.commands.blur(),
    }),
    [editor],
  );

  return (
    <View style={styles.container}>
      <style>{CSS}</style>
      {editable && (
        <View style={styles.toolbar} accessibilityRole="toolbar">
          {TOOLS.map((tool, i) => {
            if (tool === 'gap') return <View key={`gap-${i}`} style={styles.gap} />;
            const active = !!tool.name && editor.isActive(tool.name, tool.attrs);
            return (
              <Pressable
                key={tool.label}
                onPress={() => tool.run(editor)}
                style={({ hovered }: { hovered?: boolean }) => [styles.tool, hovered && styles.toolHover, active && styles.toolActive]}
                accessibilityRole="button"
                accessibilityLabel={tool.label}
                accessibilityState={{ selected: active }}
              >
                <MaterialCommunityIcons name={tool.icon} size={20} color={active ? c.accentDark : c.text.primary} />
              </Pressable>
            );
          })}
        </View>
      )}
      <ScrollView style={styles.page} contentContainerStyle={[styles.pageContent, narrow && styles.pageContentNarrow]}>
        {header}
        <EditorContent editor={editor} className={SCOPE} />
      </ScrollView>
    </View>
  );
});

export default StudiplyEditor;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, width: '100%', maxWidth: Layout.documentMaxWidth, alignSelf: 'center', gap: 12 },
    // The toolbar follows the app's appearance; the page stays white (editorCss).
    toolbar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: Layout.cardRadius.laptop,
      backgroundColor: c.card,
    },
    gap: { width: 1, height: 20, marginHorizontal: 6, backgroundColor: c.border },
    tool: { width: 34, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    toolHover: { backgroundColor: c.cardMuted },
    toolActive: { backgroundColor: c.accentLight },
    page: { flex: 1, borderRadius: Layout.cardRadius.laptop, backgroundColor: PAGE_COLORS.card },
    pageContent: { paddingHorizontal: 60, paddingTop: 44 },
    pageContentNarrow: { paddingHorizontal: 20, paddingTop: 20 },
  });
