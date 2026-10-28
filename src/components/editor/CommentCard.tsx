import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import type { CommentInfo } from '../../editor/schema/comments';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { showAlert } from '../dialogs/dialogs';

/** "28 Oct, 10:42" */
export function commentDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Writing a comment (step 4.5, laptop): the words it is about, a field,
 * Cancel and Comment (also ⌘↩). Editing an existing comment uses it too.
 */
export function CommentComposer({
  quote,
  initial = '',
  action = 'Comment',
  onSubmit,
  onCancel,
}: {
  quote?: string;
  initial?: string;
  action?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [text, setText] = useState(initial);
  const ok = text.trim().length > 0;
  const submit = () => ok && onSubmit(text.trim());
  return (
    <View style={styles.composer}>
      {quote ? (
        <Text style={styles.quote} numberOfLines={2}>
          “{quote}”
        </Text>
      ) : null}
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        placeholder="Add a comment"
        placeholderTextColor={c.text.placeholder}
        style={styles.input}
        accessibilityLabel="Comment"
        onKeyPress={(e) => {
          const k = e.nativeEvent as unknown as { key: string; metaKey?: boolean; ctrlKey?: boolean };
          if (k.key === 'Enter' && (k.metaKey || k.ctrlKey)) submit();
          if (k.key === 'Escape') onCancel();
        }}
      />
      <View style={styles.actions}>
        <Pressable onPress={onCancel} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={submit} disabled={!ok} style={[styles.primary, !ok && styles.disabled]} accessibilityRole="button" accessibilityLabel={`${action} (⌘↩)`}>
          <Text style={styles.primaryText}>{action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * One comment (step 4.5): the words it is about, its text and date, and
 * Edit · Resolve (Reopen) · Delete. Pressing it selects its words.
 */
export function CommentCard({
  comment,
  active = false,
  onSelect,
  onEdit,
  onResolve,
  onDelete,
}: {
  comment: CommentInfo;
  active?: boolean;
  onSelect?: () => void;
  onEdit: (text: string) => void;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <View style={[styles.card, styles.cardActive]}>
        <CommentComposer
          initial={comment.text}
          action="Save"
          onSubmit={(text) => {
            setEditing(false);
            onEdit(text);
          }}
          onCancel={() => setEditing(false)}
        />
      </View>
    );
  }
  const confirmDelete = () =>
    showAlert('Delete comment?', comment.text, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  const link = (label: string, onPress: () => void, danger = false) => (
    <Pressable onPress={onPress} style={styles.link} accessibilityRole="button" accessibilityLabel={`${label} comment`}>
      <Text style={[styles.linkText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
  return (
    <Pressable onPress={onSelect} style={[styles.card, active && styles.cardActive, comment.resolved && styles.resolved]} accessibilityLabel={`Comment: ${comment.text}`}>
      <Text style={styles.quote} numberOfLines={1}>
        “{comment.quote}”
      </Text>
      <Text style={styles.text}>{comment.text}</Text>
      <Text style={styles.date}>
        {commentDate(comment.createdAt)}
        {comment.resolved ? ' · Resolved' : ''}
      </Text>
      <View style={styles.links}>
        {link('Edit', () => setEditing(true))}
        {link(comment.resolved ? 'Reopen' : 'Resolve', () => onResolve(!comment.resolved))}
        {link('Delete', confirmDelete, true)}
      </View>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    composer: { gap: 8 },
    card: {
      padding: 12,
      gap: 4,
      borderRadius: 10,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardActive: { borderColor: c.accent, shadowColor: c.text.primary, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    resolved: { opacity: 0.7 },
    quote: { fontSize: Typography.size.xs, color: c.text.secondary, fontStyle: 'italic' },
    text: { fontSize: Typography.size.sm, color: c.text.primary },
    date: { fontSize: Typography.size.xs, color: c.text.secondary },
    links: { flexDirection: 'row', gap: 14, marginTop: 4 },
    link: { paddingVertical: 2 },
    linkText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    danger: { color: c.error },
    input: {
      minHeight: 60,
      maxHeight: 160,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: Typography.size.sm,
      color: c.text.primary,
      textAlignVertical: 'top',
      outlineStyle: 'none' as never,
    },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    secondary: { paddingHorizontal: 12, height: 32, justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.sm, color: c.text.secondary },
    primary: { paddingHorizontal: 16, height: 32, borderRadius: 8, justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    disabled: { opacity: 0.4 },
  });
