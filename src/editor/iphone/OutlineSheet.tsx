import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { OutlineList } from '../../components/editor/OutlineList';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Outline, OutlineHeading } from '../writing/outline';

/**
 * The iPhone's outline (step 4.7; the document menu's Outline): the
 * headings in a sheet, the section the cursor is in marked; a tap jumps to
 * the heading and closes it.
 */
export function OutlineSheet({ visible, outline, onClose, onPick }: { visible: boolean; outline: Outline | null; onClose: () => void; onPick: (h: OutlineHeading) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close outline" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.title}>Outline</Text>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={c.text.secondary} />
            </Pressable>
          </View>
          <View style={styles.list}>
            <OutlineList
              headings={outline?.headings ?? []}
              current={outline?.current ?? -1}
              onPick={(h) => {
                onClose();
                onPick(h);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', alignItems: 'center', backgroundColor: c.overlay },
    sheet: {
      width: '100%',
      maxWidth: 480,
      height: '60%',
      backgroundColor: c.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomLeftRadius: Platform.OS === 'web' ? 16 : 0,
      borderBottomRightRadius: Platform.OS === 'web' ? 16 : 0,
      overflow: 'hidden',
    },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    title: { flex: 1, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    close: { padding: 4 },
    list: { flex: 1, paddingHorizontal: 10, paddingBottom: 24 },
  });
