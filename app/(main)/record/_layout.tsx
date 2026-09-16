import { Stack } from 'expo-router';

export default function RecordLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* Disable swipe-back on active and post-session — user must use the in-screen controls */}
      <Stack.Screen name="active" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="post-session" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="review" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
