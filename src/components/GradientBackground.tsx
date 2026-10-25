import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { ThemeColors } from '../constants/colors';
import { useTheme } from '../theme/ThemeProvider';

// The full splash gradient behind every main screen (docs/design README:
// lavender → rose → amber, top to bottom; in dark mode deep indigo → dark
// plum → dark warm brown); content sits on cards.
export function gradientStops(c: ThemeColors) {
  const g = c.gradient;
  return [g.top, g.topMid, g.mid, g.bottomMid, g.bottom, g.bottomEnd] as const;
}

/** The gradient as a layer filling its parent; put it first so the content draws on top. */
export function GradientFill() {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={gradientStops(colors)}
      style={StyleSheet.absoluteFill}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      pointerEvents="none"
    />
  );
}

export function GradientBackground({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.fill, style]}>
      <GradientFill />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
