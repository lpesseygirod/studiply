import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { cleanUrl } from '../../editor/format/links';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * The laptop's link dialog (the toolbar's Link button, ⌘K, Edit in
 * the link bubble): the text when nothing is selected, the address, Apply
 * and Remove. The address is checked as it is typed (cleanUrl).
 */
export function LinkForm({
  current,
  askText,
  onApply,
  onRemove,
  onCancel,
}: {
  current: string | null;
  askText: boolean;
  onApply: (href: string, text?: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [text, setText] = useState('');
  const [address, setAddress] = useState(current ?? '');
  const href = cleanUrl(address);
  const apply = () => {
    if (href) onApply(href, askText ? text : undefined);
  };

  return (
    <View style={styles.form}>
      {askText && (
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Text to show"
          placeholderTextColor={c.text.placeholder}
          style={styles.input}
          accessibilityLabel="Link text"
        />
      )}
      <TextInput
        value={address}
        onChangeText={setAddress}
        onSubmitEditing={apply}
        placeholder="Address (e.g. uned.es)"
        placeholderTextColor={c.text.placeholder}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="url"
        style={styles.input}
        accessibilityLabel="Link address"
      />
      {address.trim() !== '' && !href && <Text style={styles.error}>That isn&apos;t an address a link can open.</Text>}
      <View style={styles.row}>
        {current ? (
          <Pressable onPress={onRemove} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>Remove link</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onCancel} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
        )}
        <Pressable onPress={apply} disabled={!href} style={[styles.primary, !href && styles.disabled]} accessibilityRole="button">
          <Text style={styles.primaryText}>Apply</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    form: { padding: 12, gap: 8 },
    input: {
      height: 36,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: Typography.size.base,
      color: c.text.primary,
      outlineStyle: 'none' as never,
    },
    error: { fontSize: Typography.size.sm, color: c.error },
    row: { flexDirection: 'row', gap: 8 },
    secondary: { flex: 1, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    secondaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    primary: { flex: 1, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    disabled: { opacity: 0.4 },
  });
