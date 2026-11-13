import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Anchor } from '../dialogs/dialogs';

/**
 * A small panel under a toolbar button (the style, font, align and
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  if (!anchor) return null;
  const left = Math.max(8, Math.min(anchor.x, windowWidth - width - 8));
  // A long menu (the table's right-click menu low on the page) moves up to fit.
  const top = Math.max(8, Math.min(anchor.y, windowHeight - height - 8));
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[styles.panel, { left, top, width }]}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        accessibilityRole="menu"
        accessibilityLabel={label}
      >
        {children}
      </View>
    </Modal>
  );
}

/** One choice in a popover menu: a tick when it is on, red when it deletes, greyed out when it can't apply. */
export function PopoverRow({
  label,
  onPress,
  checked = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ hovered }: { hovered?: boolean }) => [styles.row, hovered && !disabled && styles.rowHover, disabled && styles.disabled]}
      accessibilityRole="menuitem"
      {...a11yState({ checked, disabled })}
    >
      <View style={styles.check}>{checked && <MaterialCommunityIcons name="check" size={16} color={c.accentDark} />}</View>
      <Text style={[styles.text, danger && { color: c.error }]}>{label}</Text>
    </Pressable>
  );
}

export function PopoverDivider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

/** A small heading over a group of a menu's items ("Rows", "Layout"). */
export function PopoverHeading({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={styles.heading} accessibilityRole="header">
      {text}
    </Text>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingHorizontal: 10, marginHorizontal: 4, borderRadius: 8 },
    rowHover: { backgroundColor: c.cardMuted },
    disabled: { opacity: 0.4 },
    check: { width: 22 },
    text: { fontSize: Typography.size.base, color: c.text.primary },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: 4, marginHorizontal: 10, backgroundColor: c.border },
    heading: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary, textTransform: 'uppercase', letterSpacing: 0.6 },
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
