import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useConnectivity } from '../lib/connectivity';

// A small pill above the tab bar while Studiply's backend can't be reached.
// The iPhone keeps working from its cache; the web app needs a connection.
const MESSAGE =
  Platform.OS === 'web'
    ? "You're offline. Studiply on the web needs a connection."
    : 'Offline · changes are saved on this iPhone';

export function OfflineBanner({ bottom }: { bottom: number }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const connection = useConnectivity();
  if (connection !== 'offline') return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom }]}>
      <View style={styles.pill} accessibilityRole="alert">
        <Ionicons name="cloud-offline-outline" size={14} color={c.text.inverse} />
        <Text style={styles.text}>{MESSAGE}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.button.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: {
    color: c.text.inverse,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
});
