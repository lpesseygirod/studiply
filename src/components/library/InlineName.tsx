import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * A name typed in place on a tile: a new folder, or a folder
 * being renamed. Enter saves; tapping or clicking elsewhere saves too (as in
 * Finder); Esc cancels. The text starts selected so typing replaces it.
 */
export function InlineName({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  /** Resolves false when the name was refused (the field stays open). */
  onSave: (name: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const value = useRef(initial);
  const done = useRef(false);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    // Select the whole name once the field is on screen.
    const t = setTimeout(() => {
      input.current?.focus();
      input.current?.setSelection?.(0, initial.length);
    }, 50);
    return () => clearTimeout(t);
  }, [initial]);

  const save = async () => {
    if (done.current) return;
    done.current = true;
    const ok = await onSave(value.current);
    if (!ok) {
      done.current = false;
      input.current?.focus();
    }
  };

  return (
    <TextInput
      ref={input}
      testID="inline-name"
      style={styles.input}
      defaultValue={initial}
      onChangeText={(t) => {
        value.current = t;
      }}
      selectTextOnFocus
      autoCorrect={false}
      returnKeyType="done"
      blurOnSubmit
      onSubmitEditing={save}
      onBlur={save}
      onKeyPress={(e) => {
        if (Platform.OS === 'web' && e.nativeEvent.key === 'Escape') {
          done.current = true;
          onCancel();
        }
      }}
      placeholder="Folder name"
      placeholderTextColor={c.text.placeholder}
      accessibilityLabel="Folder name"
    />
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    input: {
      width: '100%',
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
      textAlign: 'center',
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.accent,
      backgroundColor: c.card,
    },
  });
