import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Typography } from '../../constants/typography';
import { PAGE_COLORS } from '../../editor/editorCss';
import { gradientStops } from '../GradientBackground';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * The top of the document page (docs/design desktop-01, iphone-06): the
 * short gradient line, the title (editable: Enter or leaving the field
 * renames) and the meta line ("Psicobiología · Lecture · 23 Oct 2026").
 * On the white page, so it uses the light palette; above pages on the
 * gradient (Pages, Print layout) it takes the app's text colours
 * for the gradient instead, without the line.
 */
export function DocumentHeader({
  title,
  meta,
  onRename,
  editable = true,
  selectTitle = false,
  compact = false,
  inset = false,
  onGradient = false,
  showTitle = true,
  detail,
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
  /** On the app's gradient, not the white page. */
  onGradient?: boolean;
  /** False on the phone's recording screen (Lea, 30 Oct): its header above shows the title, so it isn't shown twice. */
  showTitle?: boolean;
  /** A line under the meta line (a lecture's Transcript tab: when its recording is deleted). */
  detail?: string;
}) {
  const { colors } = useTheme();
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
      {/* The accent line belongs to the title: none without it (the phone's recording screen). */}
      {!onGradient && showTitle && <LinearGradient colors={gradientStops(PAGE_COLORS)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.accent} />}
      {showTitle && (
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
          placeholderTextColor={onGradient ? colors.text.onGradient : PAGE_COLORS.text.placeholder}
          style={[styles.title, compact && styles.titleCompact, onGradient && { color: colors.text.onGradientStrong }]}
          accessibilityLabel="Document title"
        />
      )}
      {meta ? <Text style={[styles.meta, !showTitle && styles.metaAlone, onGradient && { color: colors.text.onGradient }]}>{meta}</Text> : null}
      {detail ? (
        <Text style={[styles.meta, onGradient && { color: colors.text.onGradient }]} {...{ dataSet: { docDetail: 'true' } }}>
          {detail}
        </Text>
      ) : null}
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
  metaAlone: { marginTop: 0 },
});
