import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import type { CommentInfo } from '../../editor/schema/comments';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { CommentCard } from './CommentCard';

/**
 * Every comment in the document (step 4.5; the document menu's Comments, on
 * both devices): open ones first, then resolved ones, in the order of the
 * text. Pressing one selects its words and closes the list; each card can
 * be edited, resolved (reopened) or deleted here.
 */
export function CommentsSheet({
  visible,
  comments,
  onClose,
  onSelect,
  onEdit,
  onResolve,
  onDelete,
}: {
  visible: boolean;
  comments: CommentInfo[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const open = comments.filter((x) => !x.resolved);
  const resolved = comments.filter((x) => x.resolved);
  const card = (x: CommentInfo) => (
    <CommentCard
      key={x.id}
      comment={x}
      onSelect={() => {
        onClose();
        onSelect(x.id);
      }}
      onEdit={(text) => onEdit(x.id, text)}
      onResolve={(r) => onResolve(x.id, r)}
      onDelete={() => onDelete(x.id)}
    />
  );
  return (
    <Modal visible={visible} transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close comments" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.title}>Comments</Text>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={c.text.secondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {comments.length === 0 && <Text style={styles.empty}>No comments yet. Select some words, then add one.</Text>}
            {open.map(card)}
            {resolved.length > 0 && <Text style={styles.section}>Resolved</Text>}
            {resolved.map(card)}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', alignItems: 'center', backgroundColor: c.overlay },
    sheet: {
      width: '100%',
      maxWidth: 480,
      maxHeight: '80%',
      backgroundColor: c.cardMuted,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomLeftRadius: Platform.OS === 'web' ? 16 : 0,
      borderBottomRightRadius: Platform.OS === 'web' ? 16 : 0,
      overflow: 'hidden',
    },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    title: { flex: 1, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    close: { padding: 4 },
    list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
    section: { marginTop: 8, fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary, textTransform: 'uppercase', letterSpacing: 0.6 },
    empty: { paddingVertical: 24, textAlign: 'center', fontSize: Typography.size.sm, color: c.text.secondary },
  });
