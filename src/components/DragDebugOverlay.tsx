import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useDragDebug } from '../lib/dnd/dragDebug';
import { useThemedStyles } from '../theme/ThemeProvider';

const BOTTOM_GAP = 96;

/**
 * Development only: the drag's gestures on screen, for a screenshot
 * (Settings → General → DEVELOPMENT → Drag debug overlay). It never takes
 * touches.
 */
export function DragDebugOverlay() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { on, state } = useDragDebug();
  if (!__DEV__ || !on) return null;
  const { finger, hover, targets, events } = state;
  return (
    // At the bottom, above the tab bar (and the Record button): the breadcrumb at the top is a drop target.
    <View pointerEvents="none" style={[styles.box, { bottom: insets.bottom + BOTTOM_GAP }]} testID="drag-debug">
      <Text style={styles.title}>DRAG DEBUG</Text>
      <Text style={styles.line}>finger: {finger ? `${Math.round(finger.x)}, ${Math.round(finger.y)}` : '–'}</Text>
      <Text style={styles.line}>hover: {hover ?? '–'}</Text>
      <Text style={styles.line}>targets: {targets ?? '–'}</Text>
      {events.map((e, i) => (
        <Text key={`${i}-${e}`} style={[styles.line, i === 0 && styles.latest]} numberOfLines={1}>
          {e}
        </Text>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    box: {
      position: 'absolute',
      left: 8,
      right: 8,
      padding: 8,
      borderRadius: 10,
      // Like the Undo toast: the strongest ink as the fill, readable in both appearances.
      backgroundColor: c.text.primary,
      opacity: 0.9,
      zIndex: 1000,
      elevation: 1000,
    },
    title: { fontSize: Typography.size.xxs, fontWeight: Typography.weight.bold, color: c.white, letterSpacing: 1 },
    line: { fontSize: Typography.size.xxs, color: c.white, fontFamily: 'Menlo' },
    latest: { fontWeight: Typography.weight.bold },
  });
