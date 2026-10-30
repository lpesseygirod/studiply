import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DocColors, type ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { MENU_CALLOUT_KINDS, type CalloutKind } from '../../editor/schema/callout';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * The seven callouts (step 4.6) as a menu: each drawn as it looks in the
 * document (its fill and border), with its name; the current one checked.
 */
export function CalloutKinds({ current, onPick }: { current?: CalloutKind | null; onPick: (kind: CalloutKind) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View>
      {MENU_CALLOUT_KINDS.map((k) => (
        <Pressable
          key={k.kind}
          onPress={() => onPick(k.kind)}
          style={({ hovered }: { hovered?: boolean }) => [styles.row, hovered && styles.hover]}
          accessibilityRole="menuitem"
          accessibilityState={{ checked: current === k.kind }}
          accessibilityLabel={`Callout: ${k.name}`}
        >
          <View style={styles.check}>{current === k.kind && <MaterialCommunityIcons name="check" size={16} color={c.accentDark} />}</View>
          <View style={[styles.swatch, { backgroundColor: DocColors.callout[k.kind].bg, borderLeftColor: DocColors.callout[k.kind].border }]} />
          <Text style={styles.text}>{k.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, paddingHorizontal: 10, marginHorizontal: 4, borderRadius: 8 },
    hover: { backgroundColor: c.cardMuted },
    check: { width: 18 },
    swatch: { width: 22, height: 16, borderRadius: 3, borderLeftWidth: 3 },
    text: { fontSize: Typography.size.base, color: c.text.primary },
  });
