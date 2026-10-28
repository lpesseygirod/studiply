import React from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { Anchor } from '../dialogs/dialogs';

/**
 * A small panel under a toolbar button (step 4.4: the style, font, align and
 * line-spacing menus and the colour grids), where the app's text menus can't
 * show each choice in its own look. A click outside or Esc closes it.
 */
export function ToolbarPopover({
  anchor,
  width = 220,
  onClose,
  children,
  label,
}: {
  /** Where it opens (under its button); null: closed. */
  anchor: Anchor | null;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const { width: windowWidth } = useWindowDimensions();
  if (!anchor) return null;
  const left = Math.max(8, Math.min(anchor.x, windowWidth - width - 8));
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.panel, { left, top: anchor.y, width }]} accessibilityRole="menu" accessibilityLabel={label}>
        {children}
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    panel: {
      position: 'absolute',
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      shadowColor: c.black,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
    },
  });
