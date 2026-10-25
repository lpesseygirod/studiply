import { Stack } from 'expo-router';

import { useTheme } from '../../../src/theme/ThemeProvider';

export default function SettingsLayout() {
  const { colors } = useTheme();
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
