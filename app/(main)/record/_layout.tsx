import { Stack } from 'expo-router';

import { useTheme } from '../../../src/theme/ThemeProvider';

export default function RecordLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.gradient.top } }}>
      <Stack.Screen name="index" />
      {/* Disable swipe-back on active and post-session — user must use the in-screen controls */}
      <Stack.Screen name="active" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="post-session" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="review" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
