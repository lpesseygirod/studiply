import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/providers/AuthProvider';
import '../src/services/sync-handlers';
import { useAuth } from '../src/hooks/useAuth';
import SplashScreen from '../src/components/SplashScreen';
import DialogHost from '../src/components/dialogs/DialogHost';
import { PictureFlattenerHost } from '../src/components/PictureFlattenerHost';
import { ThemeProvider } from '../src/theme/ThemeProvider';

// Inner component that handles navigation once auth state is known.
function RootNavigator() {
  const { isLoading, isOnboarded } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inMainGroup = segments[0] === '(main)';

    if (isOnboarded && inAuthGroup) {
      router.replace('/library');
    } else if (!isOnboarded && inMainGroup) {
      router.replace('/(auth)/onboarding');
    } else if (!isOnboarded && !inAuthGroup) {
      router.replace('/(auth)/onboarding');
    }
  }, [isLoading, isOnboarded, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowSplash(false));
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
          <DialogHost />
          {/* iPhone: pictures that can be transparent are drawn on white before they become JPEGs (toJpeg). */}
          <PictureFlattenerHost />

          {showSplash && (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: splashOpacity }]} pointerEvents="none">
              <SplashScreen />
            </Animated.View>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
