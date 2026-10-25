import { Tabs, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../../src/constants/colors';
import { Layout } from '../../src/constants/layout';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { HIDDEN_ROUTES, MAIN_TABS, isFullScreenRoute, type MainTab } from '../../src/navigation/mainTabs';

// The bar's own height, above the home indicator (React Navigation's default).
const TAB_BAR_HEIGHT = 49;

function tabIcon(tab: MainTab) {
  function TabIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
    return <Ionicons name={focused ? tab.icon.active : tab.icon.inactive} size={size} color={color} />;
  }
  return TabIcon;
}

// Record: a big red circle with a white ring, raised above the bar in its exact middle.
function RecordTabButton({
  onPress,
  onLongPress,
  accessibilityState,
  testID,
}: Pick<PressableProps, 'onPress' | 'onLongPress' | 'accessibilityState' | 'testID'>) {
  return (
    <View style={styles.recordSlot} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Record lecture"
        accessibilityState={accessibilityState}
        style={({ pressed }) => [styles.recordRing, pressed && styles.recordPressed]}
      >
        <View style={styles.recordCircle}>
          <View style={styles.recordDot} />
        </View>
      </Pressable>
    </View>
  );
}

export default function MainLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isFullScreen = isFullScreenRoute(pathname);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.text.secondary,
          tabBarStyle: isFullScreen ? { display: 'none' } : styles.tabBar,
        }}
      >
        {MAIN_TABS.map(tab => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.label,
              tabBarAccessibilityLabel: tab.label,
              tabBarIcon: tabIcon(tab),
              // expo-router refuses href together with a custom button; /record is the default anyway.
              ...(tab.href === '/record' ? { tabBarButton: RecordTabButton } : { href: tab.href }),
            }}
          />
        ))}

        {/* Navigable but without a tab */}
        {HIDDEN_ROUTES.map(name => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
      </Tabs>
      <OfflineBanner bottom={(isFullScreen ? 0 : TAB_BAR_HEIGHT) + insets.bottom + 8} />
    </View>
  );
}

const RING = 4;

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopColor: Colors.surfaceMuted,
    borderTopWidth: 1,
    overflow: 'visible',
  },
  recordSlot: {
    flex: 1,
    alignItems: 'center',
  },
  recordRing: {
    width: Layout.recordButtonSize,
    height: Layout.recordButtonSize,
    borderRadius: Layout.recordButtonSize / 2,
    marginTop: -Layout.recordButtonSize / 2 + 4,
    padding: RING,
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  recordPressed: { opacity: 0.85 },
  recordCircle: {
    flex: 1,
    borderRadius: (Layout.recordButtonSize - RING * 2) / 2,
    backgroundColor: Colors.recording,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.white,
  },
});
