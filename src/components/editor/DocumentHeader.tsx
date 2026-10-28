import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Typography } from '../../constants/typography';
import { PAGE_COLORS } from '../../editor/editorCss';
import { gradientStops } from '../GradientBackground';

/**
 * The top of the document page (docs/design desktop-01, iphone-06): the
 * short gradient line, the title (editable: Enter or leaving the field
 * renames) and the meta line ("Psicobiología · Lecture · 23 Oct 2026").
 * On the white page, so it always uses the light palette.
 */
export function DocumentHeader({
  title,
  meta,
  onRename,
  editable = true,
  selectTitle = false,
  compact = false,
  inset = false,
}: {
  title: string;
  meta: string;
  /** Resolves with the saved title, or throws (the field goes back). */
  onRename: (title: string) => Promise<string>;
  editable?: boolean;
  /** A new document: the title field opens selected. */
  selectTitle?: boolean;
  /** iPhone width: a smaller title. */
  compact?: boolean;
  /** Its own side margins (above the iPhone's WebView, which has its own). */
  inset?: boolean;
}) {
  const [draft, setDraft] = useState(title);
  const editing = useRef(false);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (!editing.current) setDraft(title);
  }, [title]);

  useEffect(() => {
    if (!selectTitle) return;
    const t = setTimeout(() => input.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [selectTitle]);

  const commit = async () => {
    editing.current = false;
    const next = draft.trim().replace(/\s+/g, ' ');
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    try {
      setDraft(await onRename(next));
    } catch {
      setDraft(title);
    }
  };

  return (
    <View style={[styles.header, compact && styles.headerCompact, inset && styles.headerInset]}>
      <LinearGradient colors={gradientStops(PAGE_COLORS)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.accent} />
      <TextInput
        ref={input}
        value={draft}
        onChangeText={setDraft}
        onFocus={() => (editing.current = true)}
        onBlur={commit}
        onSubmitEditing={() => input.current?.blur()}
        editable={editable}
        selectTextOnFocus={selectTitle}
        returnKeyType="done"
        blurOnSubmit
        multiline={false}
        maxLength={200}
        placeholder="Untitled document"
        placeholderTextColor={PAGE_COLORS.text.placeholder}
        style={[styles.title, compact && styles.titleCompact]}
        accessibilityLabel="Document title"
      />
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 20 },
  headerCompact: { marginBottom: 12 },
  headerInset: { paddingHorizontal: 20, paddingTop: 18, marginBottom: 4 },
  accent: { width: 56, height: 4, borderRadius: 2, marginBottom: 18 },
  title: {
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.bold,
    color: PAGE_COLORS.text.primary,
    padding: 0,
    // No focus ring on the web: the caret shows where you are.
    outlineStyle: 'none' as never,
  },
  titleCompact: { fontSize: Typography.size.xl },
  meta: { marginTop: 6, fontSize: Typography.size.sm, color: PAGE_COLORS.text.secondary },
});
