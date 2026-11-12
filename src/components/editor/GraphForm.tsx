import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { GRAPH_KINDS, MAX_ROWS, MAX_SERIES, MAX_TEXT, MAX_TITLE, planGraph, type FormKind, type GraphData } from '../../editor/graph/data';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

const ICONS: Record<FormKind, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  bar: 'chart-bar',
  line: 'chart-line',
  pie: 'chart-pie',
  scatter: 'chart-scatter-plot',
};
// Numbers with a minus and a decimal comma or point on the iPhone.
const NUMBER_KEYS = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

/**
 * A graph's data, the same on both devices: its type, title and
 * axis labels, and a small table (a label per row, a column per series, up to
 * 3). Every change is reported at once, so the graph in the document redraws
 * as the student types (laptop: a popover under the graph; iPhone: a sheet).
 */
export function GraphForm({ value, onChange, onDone, onDelete }: { value: GraphData; onChange: (next: GraphData) => void; onDone: () => void; onDelete: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const set = (patch: Partial<GraphData>) => onChange({ ...value, ...patch });
  const setCell = (row: number, col: number, text: string) => set({ rows: value.rows.map((r, i) => (i === row ? r.map((cell, j) => (j === col ? text : cell)) : r)) });
  const addRow = () => set({ rows: [...value.rows, Array(value.series.length + 1).fill('')] });
  const removeRow = (row: number) => set({ rows: value.rows.filter((_, i) => i !== row) });
  const addSeries = () => set({ series: [...value.series, `Series ${value.series.length + 1}`], rows: value.rows.map((r) => [...r, '']) });
  const removeSeries = (s: number) => set({ series: value.series.filter((_, i) => i !== s), rows: value.rows.map((r) => r.filter((_, j) => j !== s + 1)) });
  const { notes } = planGraph(value);
  const field = (text: string, onText: (t: string) => void, label: string, style: object, numeric = false) => (
    <TextInput
      value={text}
      onChangeText={onText}
      maxLength={MAX_TEXT}
      style={[styles.input, style]}
      placeholderTextColor={c.text.placeholder}
      keyboardType={numeric ? NUMBER_KEYS : 'default'}
      autoCorrect={false}
      accessibilityLabel={label}
    />
  );
  const remove = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={styles.remove} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialCommunityIcons name="close" size={14} color={c.text.secondary} />
    </Pressable>
  );

  return (
    <View style={styles.form}>
      <View style={styles.kinds}>
        {GRAPH_KINDS.map((k) => (
          <Pressable
            key={k.kind}
            onPress={() => set({ kind: k.kind })}
            style={[styles.kind, value.kind === k.kind && styles.kindOn]}
            accessibilityRole="button"
            // react-native-web 0.21 reads aria-selected, not accessibilityState.
            aria-selected={value.kind === k.kind}
            {...a11yState({ selected: value.kind === k.kind })}
            accessibilityLabel={`Graph type: ${k.name}`}
          >
            <MaterialCommunityIcons name={ICONS[k.kind]} size={20} color={value.kind === k.kind ? c.accentDark : c.text.secondary} />
            <Text style={[styles.kindText, value.kind === k.kind && styles.kindTextOn]}>{k.name}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={value.title}
        onChangeText={(title) => set({ title })}
        maxLength={MAX_TITLE}
        placeholder="Title (what the graph shows)"
        placeholderTextColor={c.text.placeholder}
        style={styles.input}
        accessibilityLabel="Graph title"
      />
      {value.kind !== 'pie' && (
        <View style={styles.axes}>
          <TextInput value={value.xLabel} onChangeText={(xLabel) => set({ xLabel })} maxLength={MAX_TEXT} placeholder="X axis" placeholderTextColor={c.text.placeholder} style={[styles.input, styles.flex]} accessibilityLabel="X-axis label" />
          <TextInput value={value.yLabel} onChangeText={(yLabel) => set({ yLabel })} maxLength={MAX_TEXT} placeholder="Y axis" placeholderTextColor={c.text.placeholder} style={[styles.input, styles.flex]} accessibilityLabel="Y-axis label" />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View>
          <View style={styles.row}>
            <Text style={[styles.head, styles.labelCell]}>{value.kind === 'scatter' ? 'X' : 'Label'}</Text>
            {value.series.map((name, s) => (
              <View key={s} style={styles.seriesHead}>
                {field(name, (t) => set({ series: value.series.map((n, i) => (i === s ? t : n)) }), `Series ${s + 1} name`, styles.valueCell)}
                {value.series.length > 1 && remove(`Remove ${name || `series ${s + 1}`}`, () => removeSeries(s))}
              </View>
            ))}
          </View>
          <ScrollView style={styles.rows} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {value.rows.map((r, i) => (
              <View key={i} style={styles.row}>
                {field(r[0], (t) => setCell(i, 0, t), `Row ${i + 1} ${value.kind === 'scatter' ? 'X' : 'label'}`, styles.labelCell, value.kind === 'scatter')}
                {value.series.map((_, s) => (
                  <View key={s} style={styles.cellWrap}>
                    {field(r[s + 1] ?? '', (t) => setCell(i, s + 1, t), `Row ${i + 1}, ${value.series[s] || `series ${s + 1}`}`, styles.valueCell, true)}
                  </View>
                ))}
                {remove(`Remove row ${i + 1}`, () => removeRow(i))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
      <View style={styles.adds}>
        <Pressable onPress={addRow} disabled={value.rows.length >= MAX_ROWS} style={styles.add} accessibilityRole="button" accessibilityLabel="Add row">
          <Text style={[styles.addText, value.rows.length >= MAX_ROWS && styles.off]}>+ Row</Text>
        </Pressable>
        <Pressable onPress={addSeries} disabled={value.series.length >= MAX_SERIES} style={styles.add} accessibilityRole="button" accessibilityLabel="Add series">
          <Text style={[styles.addText, value.series.length >= MAX_SERIES && styles.off]}>+ Series</Text>
        </Pressable>
      </View>
      {notes.map((n) => (
        <Text key={n} style={styles.note}>
          {n}
        </Text>
      ))}
      <View style={styles.actions}>
        <Pressable onPress={onDelete} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Delete graph">
          <Text style={styles.deleteText}>Delete graph</Text>
        </Pressable>
        <View style={styles.flex} />
        <Pressable onPress={onDone} style={styles.primary} accessibilityRole="button" accessibilityLabel="Done with the graph">
          <Text style={styles.primaryText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    form: { padding: 12, gap: 10 },
    kinds: { flexDirection: 'row', gap: 6 },
    kind: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.border },
    kindOn: { backgroundColor: c.accentLight, borderColor: c.accent },
    kindText: { fontSize: Typography.size.xs, color: c.text.secondary },
    kindTextOn: { color: c.accentDark, fontWeight: Typography.weight.semibold },
    axes: { flexDirection: 'row', gap: 8 },
    flex: { flex: 1 },
    input: {
      height: 34,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: Typography.size.sm,
      color: c.text.primary,
      outlineStyle: 'none' as never,
    },
    rows: { maxHeight: 220 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
    head: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary, paddingHorizontal: 8 },
    seriesHead: { flexDirection: 'row', alignItems: 'center' },
    cellWrap: { flexDirection: 'row' },
    labelCell: { width: 110 },
    valueCell: { width: 84 },
    remove: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    adds: { flexDirection: 'row', gap: 6 },
    add: { paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: c.cardMuted },
    addText: { fontSize: Typography.size.sm, color: c.text.primary },
    off: { color: c.text.placeholder },
    note: { fontSize: Typography.size.xs, color: c.text.secondary },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    secondary: { paddingHorizontal: 4, height: 34, justifyContent: 'center' },
    deleteText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.error },
    primary: { paddingHorizontal: 18, height: 34, borderRadius: 8, justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
  });
