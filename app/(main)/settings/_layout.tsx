import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Slot, Stack } from 'expo-router';

import { useTheme } from '../../../src/theme/ThemeProvider';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { GradientFill } from '../../../src/components/GradientBackground';
import { SettingsMenu } from '../../../src/components/settings/SettingsMenu';
import { Layout } from '../../../src/constants/layout';

/**
 * Settings (step 3.6). iPhone: the list, each section a page on a stack.
 * Laptop (docs/design desktop-05): two columns on the gradient, the section
 * menu on the left and the open section on the right; one route per section.
 */
export default function SettingsLayout() {
  const { colors } = useTheme();
  const wide = useLayoutMode() === 'wide';

  if (!wide) {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.gradient.top },
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <GradientFill />
      <View style={styles.columns}>
        <View style={styles.menu}>
          <SettingsMenu />
        </View>
        <View style={styles.page}>
          <Slot />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  menu: { width: Layout.settingsMenuWidth },
  page: { flex: 1, minWidth: 0 },
});
