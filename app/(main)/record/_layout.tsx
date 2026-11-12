import { Stack } from 'expo-router';

import { useTheme } from '../../../src/theme/ThemeProvider';

export default function RecordLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.gradient.top } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
