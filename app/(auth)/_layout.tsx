import { Stack } from 'expo-router';

// Auth stack — no header, no tab bar. Full-screen screens only.
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
  );
}
