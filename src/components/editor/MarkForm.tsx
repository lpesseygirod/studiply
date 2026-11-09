import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DocColors, type ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { MARK_KINDS, type MarkKind } from '../../editor/schema/markChip';

/**
 * A mark chip's kind and level (step 4.6), for putting one in or changing
 * it, on both devices (the laptop's popover, the iPhone's sheet): Important ·
 * Confused · Exam in their chip colours, then the level 1–10.
 */
export function MarkForm({
  kind: startKind,
  level: startLevel,
  action,
  onSubmit,
  onRemove,
}: {
  kind: MarkKind;
  level: number | null;
  /** "Insert" or "Done". */
  action: string;
  onSubmit: (kind: MarkKind, level: number | null) => void;
  onRemove?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [kind, setKind] = useState(startKind);
  const [level, setLevel] = useState<number | null>(startLevel);
  useEffect(() => {
    setKind(startKind);
    setLevel(startLevel);
  }, [startKind, startLevel]);

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Kind</Text>
      <View style={styles.row}>
        {MARK_KINDS.map((k) => (
          <Pressable
            key={k.kind}
            onPress={() => setKind(k.kind)}
            style={[styles.kind, { backgroundColor: DocColors.markChip[k.kind].bg }, kind === k.kind && styles.kindOn]}
            accessibilityRole="radio"
            {...a11yState({ checked: kind === k.kind })}
            accessibilityLabel={`Mark: ${k.name}`}
          >
            <Text style={[styles.kindText, { color: DocColors.markChip[k.kind].text }]}>{k.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Level</Text>
      <View style={styles.levels}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            onPress={() => setLevel(n)}
            style={[styles.level, level === n && styles.levelOn]}
            accessibilityRole="radio"
            {...a11yState({ checked: level === n })}
            accessibilityLabel={`Level ${n}`}
          >
            <Text style={[styles.levelText, level === n && styles.levelTextOn]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        {onRemove && (
          <Pressable onPress={onRemove} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Remove mark">
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        )}
        <View style={styles.flex} />
        <Pressable onPress={() => onSubmit(kind, level)} style={styles.primary} accessibilityRole="button" accessibilityLabel={`${action} mark`}>
          <Text style={styles.primaryText}>{action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    form: { gap: 8 },
    label: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary, textTransform: 'uppercase', letterSpacing: 0.6 },
    row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    kind: { paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
    kindOn: { borderColor: c.accentDark },
    kindText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
    levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    level: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    levelOn: { backgroundColor: c.accentDark, borderColor: c.accentDark },
    levelText: { fontSize: Typography.size.sm, color: c.text.primary, fontVariant: ['tabular-nums'] },
    levelTextOn: { color: c.accentOn, fontWeight: Typography.weight.semibold },
    actions: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    flex: { flex: 1 },
    secondary: { height: 36, paddingHorizontal: 12, justifyContent: 'center' },
    remove: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.error },
    primary: { height: 36, paddingHorizontal: 18, borderRadius: 10, justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
  });
