import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { clampCols, clampRows, MAX_TABLE } from '../../editor/table/resize';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * Rows × columns typed in (step 4.5, Lea: "6 × 4, up to 50 × 20"), for
 * inserting a table and for Table size…, on the laptop. A larger number is
 * lowered to the limit, which shows under the fields.
 */
export function TableSizeForm({
  rows: initialRows,
  cols: initialCols,
  action,
  onSubmit,
}: {
  rows: number;
  cols: number;
  /** The button: "Insert" or "Apply". */
  action: string;
  onSubmit: (rows: number, cols: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [rows, setRows] = useState(String(initialRows));
  const [cols, setCols] = useState(String(initialCols));
  const parse = (text: string, clamp: (n: number) => number) => (/^\d+$/.test(text.trim()) ? clamp(Number(text)) : null);
  const r = parse(rows, clampRows);
  const k = parse(cols, clampCols);
  const lowered = (r !== null && Number(rows) > MAX_TABLE.rows) || (k !== null && Number(cols) > MAX_TABLE.cols);
  const submit = () => {
    if (r === null || k === null) return;
    setRows(String(r));
    setCols(String(k));
    onSubmit(r, k);
  };
  const field = (value: string, set: (v: string) => void, label: string) => (
    <TextInput
      value={value}
      onChangeText={(v) => set(v.replace(/\D/g, ''))}
      onSubmitEditing={submit}
      inputMode="numeric"
      selectTextOnFocus
      style={styles.input}
      placeholderTextColor={c.text.placeholder}
      accessibilityLabel={label}
    />
  );
  return (
    <View style={styles.form}>
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>Rows</Text>
          {field(rows, setRows, 'Rows')}
        </View>
        <Text style={styles.times}>×</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Columns</Text>
          {field(cols, setCols, 'Columns')}
        </View>
        <Pressable onPress={submit} disabled={r === null || k === null} style={[styles.button, (r === null || k === null) && styles.disabled]} accessibilityRole="button">
          <Text style={styles.buttonText}>{action}</Text>
        </Pressable>
      </View>
      <Text style={[styles.hint, lowered && { color: c.accentDark }]}>
        {lowered ? `Up to ${MAX_TABLE.rows} rows and ${MAX_TABLE.cols} columns: it will be ${r} × ${k}.` : `Up to ${MAX_TABLE.rows} × ${MAX_TABLE.cols}.`}
      </Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    form: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    field: { gap: 3 },
    label: { fontSize: Typography.size.xs, color: c.text.secondary },
    input: {
      width: 54,
      height: 32,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: Typography.size.base,
      color: c.text.primary,
      textAlign: 'center',
      outlineStyle: 'none' as never,
    },
    times: { fontSize: Typography.size.base, color: c.text.secondary, paddingBottom: 7 },
    button: { flex: 1, height: 32, marginLeft: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.button.primary },
    buttonText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    disabled: { opacity: 0.4 },
    hint: { fontSize: Typography.size.xs, color: c.text.secondary },
  });
