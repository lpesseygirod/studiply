import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { LightColors } from '../constants/colors';

/**
 * Studiply's icon as the laptop's top bar draws it: the light gradient (lavender to rose) with the
 * white book, the same in both themes. Also the consent screen's header (desktop-09, step 10.1).
 */
export function LogoTile({ size = 30, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={[LightColors.gradient.top, LightColors.gradient.bottomMid]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.27) }, style]}
    >
      <Ionicons name="book" size={Math.round(size / 2)} color={LightColors.white} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
