import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { FORMULA_STARTERS } from '../../editor/schema/formula';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

const MONO = Platform.select({ ios: 'Menlo', default: 'ui-monospace, Menlo, Consolas, monospace' });

/**
 * A formula's editor (step 4.5), the same on both devices: inline or
 * display, the LaTeX, starters (fraction, power, root, sum, integral) that
 * go in where the cursor is, and Remove / Done. Every change is reported at
 * once, so the formula in the text changes as the student types. The
 * laptop adds a KaTeX preview (`preview`); on the iPhone the text behind is
 * the preview.
 */
export function FormulaForm({
  latex,
  display,
  onChange,
  onDone,
  onRemove,
  preview,
}: {
  latex: string;
  display: boolean;
  onChange: (latex: string, display: boolean) => void;
  onDone: () => void;
  /** Only for a formula already in the text. */
  onRemove?: () => void;
  preview?: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const input = useRef<TextInput>(null);
  const [selection, setSelection] = useState({ start: latex.length, end: latex.length });

  const insert = (text: string) => {
    const next = latex.slice(0, selection.start) + text + latex.slice(selection.end);
    const at = selection.start + text.length;
    setSelection({ start: at, end: at });
    onChange(next, display);
    input.current?.focus();
  };

  const kind = (label: string, value: boolean) => (
    <Pressable
      onPress={() => onChange(latex, value)}
      style={[styles.segment, display === value && styles.segmentOn]}
      accessibilityRole="button"
      // react-native-web 0.21 reads aria-selected, not accessibilityState.
      aria-selected={display === value}
      {...a11yState({ selected: display === value })}
      accessibilityLabel={value ? 'Formula on its own line' : 'Formula in the text'}
    >
      <Text style={[styles.segmentText, display === value && styles.segmentTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.form}>
      <View style={styles.segments}>
        {kind('In the text', false)}
        {kind('On its own line', true)}
      </View>
      <TextInput
        ref={input}
        value={latex}
        onChangeText={(text) => onChange(text, display)}
        selection={selection}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        multiline
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
        placeholder="e.g. x^2 + y^2 = r^2"
        placeholderTextColor={c.text.placeholder}
        style={styles.input}
        accessibilityLabel="Formula"
      />
      <Text style={styles.howTo}>Typed like this: x^2 for a power, \frac{'{'}a{'}'}{'{'}b{'}'} for a fraction, \sqrt{'{'}x{'}'} for a root.</Text>
      <View style={styles.starters}>
        {FORMULA_STARTERS.map((s) => (
          <Pressable key={s.label} onPress={() => insert(s.latex)} style={styles.starter} accessibilityRole="button" accessibilityLabel={`Insert ${s.label.toLowerCase()}`}>
            <Text style={styles.starterText}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
      {preview}
      <View style={styles.actions}>
        {onRemove && (
          <Pressable onPress={onRemove} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Remove formula">
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        )}
        <View style={styles.spacer} />
        <Pressable onPress={onDone} style={styles.primary} accessibilityRole="button" accessibilityLabel="Done with the formula">
          <Text style={styles.primaryText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    form: { padding: 12, gap: 10 },
    segments: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    segment: { paddingHorizontal: 14, paddingVertical: 6 },
    segmentOn: { backgroundColor: c.accentLight },
    segmentText: { fontSize: Typography.size.sm, color: c.text.secondary },
    segmentTextOn: { color: c.accentDark, fontWeight: Typography.weight.semibold },
    howTo: { fontSize: Typography.size.xs, color: c.text.secondary },
    input: {
      minHeight: 64,
      maxHeight: 140,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      fontFamily: MONO,
      fontSize: Typography.size.base,
      color: c.text.primary,
      textAlignVertical: 'top',
      outlineStyle: 'none' as never,
    },
    starters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    starter: { paddingHorizontal: 10, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: c.cardMuted },
    starterText: { fontSize: Typography.size.sm, color: c.text.primary },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    spacer: { flex: 1 },
    secondary: { paddingHorizontal: 12, height: 34, justifyContent: 'center' },
    removeText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.error },
    primary: { paddingHorizontal: 18, height: 34, borderRadius: 8, justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
  });
