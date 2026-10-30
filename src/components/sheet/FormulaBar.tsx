import React, { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PAGE_COLORS } from '../../editor/editorCss';
import { TOOLS } from '../../editor/toolNames';
import { Typography } from '../../constants/typography';
import { MAX_CELL_INPUT } from '../../lib/sheetDoc';

/**
 * A spreadsheet's formula bar (step 4.7e): the selected cell's name (B3, or
 * B3:C5), what was typed in it (the formula, not its result), and Bold.
 * Clicking (tapping) the input edits the cell there. Under it, a short line
 * when the cell shows an error.
 */
export const FormulaBar = forwardRef<
  TextInput,
  {
    name: string;
    input: string;
    /** The cell is being edited here (not in the cell). */
    editing: boolean;
    editable: boolean;
    bold: boolean;
    error: string | null;
    compact: boolean;
    /** Under the grid, on the keyboard (iPhone): its line on top, the error line above it. */
    below?: boolean;
    /** iPhone: where to put the cursor once (after pointing or autocomplete). */
    selection?: { start: number; end: number };
    /** Phone: ✓ ends typing (it takes Bold's place while typing). */
    onDone?: () => void;
    onFocus: () => void;
    onChangeText: (text: string) => void;
    /** Where the cursor is (the formula's help line and pointing read it). */
    onSelectionChange: (e: NativeSyntheticEvent<{ selection: { start: number; end: number } }>) => void;
    onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
    onSubmit: () => void;
    onBlur: () => void;
    onBold: () => void;
    /** Undo / Redo of the sheet's cells (step 4.7e 2b), as the text toolbar's. */
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
  }
>(function FormulaBar(
  { name, input, editing, editable, bold, error, compact, below = false, selection, onDone, onFocus, onChangeText, onSelectionChange, onKeyPress, onSubmit, onBlur, onBold, canUndo, canRedo, onUndo, onRedo },
  ref,
) {
  const errorLine = error ? (
    <Text style={[styles.error, below && styles.errorAbove]} accessibilityLiveRegion="polite">
      {error}
    </Text>
  ) : null;
  const history = (key: 'undo' | 'redo', enabled: boolean, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      style={({ hovered }: { hovered?: boolean }) => [styles.tool, compact && styles.toolCompact, hovered && enabled && styles.toolHover, !enabled && styles.off]}
      accessibilityRole="button"
      accessibilityLabel={TOOLS[key].name}
      aria-disabled={!enabled}
    >
      <MaterialCommunityIcons name={key} size={20} color={PAGE_COLORS.text.primary} />
    </Pressable>
  );
  return (
    <View style={[styles.wrap, below && styles.wrapBelow]}>
      {below && errorLine}
      <View style={[styles.bar, compact && styles.barCompact]}>
        {editable && history('undo', canUndo, onUndo)}
        {editable && history('redo', canRedo, onRedo)}
        <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1} accessibilityLabel={`Selected: ${name}`}>
          {name}
        </Text>
        {!compact && (
          <Text style={styles.fx} accessibilityElementsHidden importantForAccessibility="no">
            fx
          </Text>
        )}
        <TextInput
          ref={ref}
          value={input}
          editable={editable}
          selection={selection}
          onFocus={onFocus}
          onChangeText={onChangeText}
          onSelectionChange={onSelectionChange}
          onKeyPress={onKeyPress}
          onSubmitEditing={onSubmit}
          onBlur={onBlur}
          blurOnSubmit={false}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={MAX_CELL_INPUT}
          style={[styles.input, editing && styles.inputEditing, compact && styles.inputCompact]}
          accessibilityLabel="Formula bar"
          placeholder={editable ? 'Type a value, or = for a formula' : undefined}
          placeholderTextColor={PAGE_COLORS.text.placeholder}
        />
        {editable && compact && editing && onDone ? (
          <Pressable onPress={onDone} style={[styles.bold, styles.boldCompact, styles.done]} accessibilityRole="button" accessibilityLabel="Done">
            <MaterialCommunityIcons name="check" size={22} color={PAGE_COLORS.accentOn} />
          </Pressable>
        ) : (
          editable && (
            <Pressable
              onPress={onBold}
              style={({ hovered }: { hovered?: boolean }) => [styles.bold, compact && styles.boldCompact, bold ? styles.boldOn : hovered && styles.boldHover]}
              accessibilityRole="button"
              accessibilityLabel="Bold"
              // react-native-web 0.21 reads aria-pressed, not accessibilityState.
              aria-pressed={bold}
              accessibilityState={{ selected: bold }}
            >
              <Text style={[styles.boldText, bold && styles.boldTextOn]}>B</Text>
            </Pressable>
          )
        )}
      </View>
      {!below && errorLine}
    </View>
  );
});

const C = PAGE_COLORS;

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.card },
  wrapBelow: { borderBottomWidth: 0, borderTopWidth: 1 },
  errorAbove: { paddingTop: 6, paddingBottom: 0 },
  nameCompact: { minWidth: 44, maxWidth: 76, paddingHorizontal: 6 },
  done: { backgroundColor: C.accentDark, borderRadius: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  barCompact: { paddingHorizontal: 8 },
  name: {
    minWidth: 64,
    maxWidth: 110,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: C.cardMuted,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: C.text.primary,
    textAlign: 'center',
  },
  fx: { fontSize: Typography.size.sm, fontStyle: 'italic', fontWeight: Typography.weight.semibold, color: C.accentDark },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: Typography.size.sm,
    color: C.text.primary,
    backgroundColor: C.card,
    outlineStyle: 'none',
  } as never,
  inputEditing: { borderColor: C.accent },
  inputCompact: { fontSize: Typography.size.base, paddingVertical: 8 },
  tool: { width: 32, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  toolCompact: { width: 34, height: 44 },
  toolHover: { backgroundColor: C.cardMuted },
  off: { opacity: 0.35 },
  bold: { width: 32, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  boldCompact: { width: 44, height: 44 },
  boldHover: { backgroundColor: C.cardMuted },
  boldOn: { backgroundColor: C.accentLight },
  boldText: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: C.text.secondary },
  boldTextOn: { color: C.accentDark },
  error: { paddingHorizontal: 12, paddingBottom: 6, fontSize: Typography.size.xs, color: C.status.error.text },
});
