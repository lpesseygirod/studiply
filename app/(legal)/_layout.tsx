import { Stack } from 'expo-router';

// Step 10.1b-1: the legal pages, readable signed in or signed out (the root layout lets this
// group through). No shell around them: the same page on the laptop and the iPhone.
export default function LegalLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
