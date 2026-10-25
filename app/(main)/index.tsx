import { Redirect } from 'expo-router';

// Home is part of Library (docs/design: there is no separate Home screen).
export default function MainIndex() {
  return <Redirect href="/library" />;
}
