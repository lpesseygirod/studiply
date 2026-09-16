import { Tabs, usePathname } from 'expo-router';
import { Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IoniconsName, inactive: IoniconsName) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
  );
}

// The Record tab gets a circular pill background to draw attention.
function RecordTabIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: focused ? Colors.salmon : Colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={focused ? 'mic' : 'mic-outline'}
        size={22}
        color={focused ? Colors.white : Colors.text.secondary}
      />
    </View>
  );
}

export default function MainLayout() {
  const pathname = usePathname();

  // Hide the tab bar on the active recording and post-session screens.
  // These are full-screen experiences and the user must use in-screen controls.
  const isFullScreen =
    pathname.includes('/record/active') ||
    pathname.includes('/record/post-session') ||
    pathname.includes('/record/review') ||
    pathname.includes('/note/');

  const tabBarStyle = isFullScreen
    ? { display: 'none' as const }
    : {
        backgroundColor: Colors.white,
        borderTopColor: Colors.surfaceMuted,
        borderTopWidth: 1,
        height: Platform.OS === 'ios' ? 76 : 60,
      };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.salmon,
        tabBarInactiveTintColor: Colors.text.secondary,
        tabBarStyle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="search/index"
        options={{
          href: '/search',
          tabBarIcon: tabIcon('search', 'search-outline'),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          href: '/record',
          tabBarIcon: ({ focused }) => <RecordTabIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="library/index"
        options={{
          href: '/library',
          tabBarIcon: tabIcon('library', 'library-outline'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: '/settings',
          tabBarIcon: tabIcon('settings', 'settings-outline'),
        }}
      />

      {/* Hidden screens — navigable but not shown in the tab bar */}
      <Tabs.Screen name="project/[id]" options={{ href: null }} />
      <Tabs.Screen name="note/[id]" options={{ href: null }} />
    </Tabs>
  );
}
