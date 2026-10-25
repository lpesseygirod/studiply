import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '../constants/colors';

// The full splash gradient behind every main screen (docs/design README:
// lavender → rose → amber, top to bottom); content sits on white cards.
const STOPS = [
  Colors.gradient.top,
  Colors.gradient.topMid,
  Colors.gradient.mid,
  Colors.gradient.bottomMid,
  Colors.gradient.bottom,
  Colors.gradient.bottomEnd,
] as const;

export function GradientBackground({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.fill, style]}>
      <LinearGradient colors={STOPS} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
