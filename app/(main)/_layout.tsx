import { Tabs, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../../src/constants/colors';
import { Layout } from '../../src/constants/layout';
import { GradientFill } from '../../src/components/GradientBackground';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { AssistantPanel } from '../../src/components/shell/AssistantPanel';
import { Sidebar } from '../../src/components/shell/Sidebar';
import { TopBar } from '../../src/components/shell/TopBar';
import { screenKindFor, useLayoutMode } from '../../src/hooks/useLayoutMode';
import { useLayoutPrefs } from '../../src/lib/layoutPrefs';
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

/**
 * The iPhone (and a narrow browser window): the tab bar, documents full screen.
 * The laptop (web, 1024 px and wider): the top bar, the library sidebar and,
 * beside documents, the study assistant, around the same navigator. The
 * navigator keeps its place in the tree, so resizing the window switches
 * the layout without losing the open screen.
 */
export default function MainLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const wide = useLayoutMode() === 'wide';
  const kind = screenKindFor(pathname);
  const [prefs, setPrefs] = useLayoutPrefs();
  const isFullScreen = isFullScreenRoute(pathname);

  const showSidebar = wide && kind !== 'settings' && prefs.sidebarOpen;
  const showAssistant = wide && kind === 'document' && prefs.assistantOpen;

  return (
    <View style={styles.root}>
      {wide && (
        <TopBar
          kind={kind}
          documentTitle={pathname.startsWith('/record') ? 'New recording' : 'Lecture notes'}
          sidebarOpen={prefs.sidebarOpen}
          assistantOpen={prefs.assistantOpen}
          onToggleSidebar={() => setPrefs({ sidebarOpen: !prefs.sidebarOpen })}
          onToggleAssistant={() => setPrefs({ assistantOpen: !prefs.assistantOpen })}
        />
      )}
      {/* The recording strip goes here (Phase 5). */}
      <View style={styles.row}>
        {showSidebar && <Sidebar kind={kind} />}
        <View style={styles.center}>
          {wide && <GradientFill />}
          <View style={[styles.centerColumn, wide && kind !== 'library' && styles.centerColumnNarrow]}>
            <Tabs
              screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: Colors.accent,
                tabBarInactiveTintColor: Colors.text.secondary,
                tabBarStyle: wide || isFullScreen ? { display: 'none' } : styles.tabBar,
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
          </View>
          {wide && <OfflineBanner bottom={16} />}
        </View>
        {showAssistant && <AssistantPanel onClose={() => setPrefs({ assistantOpen: false })} />}
      </View>
      {!wide && <OfflineBanner bottom={(isFullScreen ? 0 : TAB_BAR_HEIGHT) + insets.bottom + 8} />}
    </View>
  );
}

const RING = 4;

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  center: { flex: 1, minWidth: 0 },
  centerColumn: { flex: 1, width: '100%', alignSelf: 'center' },
  // Documents and settings: a centered column on the gradient (the page is 820 px).
  centerColumnNarrow: { maxWidth: Layout.documentMaxWidth + 48 },
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
