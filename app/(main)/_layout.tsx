import { useEffect } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../src/constants/colors';
import { Layout } from '../../src/constants/layout';
import { Typography } from '../../src/constants/typography';
import { a11yState } from '../../src/utils/a11y';
import { GradientFill } from '../../src/components/GradientBackground';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { AssistantPanel } from '../../src/components/shell/AssistantPanel';
import { RecordingHost } from '../../src/components/recording/RecordingHost';
import { RecordingPill } from '../../src/components/recording/RecordingPill';
import { RecordingStrip } from '../../src/components/recording/RecordingStrip';
import { SummarizePanel } from '../../src/components/summarize/SummarizePanel';
import { LecturePicker } from '../../src/components/summarize/LecturePicker';
import { NewQuizPanel } from '../../src/components/quiz/NewQuizPanel';
import { RemindersHost } from '../../src/components/reminders/RemindersHost';
import { NewFolderHost } from '../../src/components/library/NewFolderHost';
import { SummaryBanner } from '../../src/components/summarize/SummaryBanner';
import { useSummaryBanner } from '../../src/components/summarize/summaryBannerState';
import { DragDebugOverlay } from '../../src/components/DragDebugOverlay';
import { SimulatedAiBadge } from '../../src/components/SimulatedAiBadge';
import { registerShellCommand, ShellProvider } from '../../src/components/shell/ShellContext';
import { KeyboardShortcuts } from '../../src/components/shell/KeyboardShortcuts';
import { Sidebar } from '../../src/components/shell/Sidebar';
import { TopBar } from '../../src/components/shell/TopBar';
import { screenKindFor, useLayoutMode } from '../../src/hooks/useLayoutMode';
import { useLayoutPrefs } from '../../src/lib/layoutPrefs';
import { useUndoToast } from '../../src/hooks/useUndoToast';
import { AppUndoProvider } from '../../src/hooks/useAppUndo';
import { HIDDEN_ROUTES, MAIN_TABS, isFullScreenRoute, type MainTab } from '../../src/navigation/mainTabs';
import { setCommentMarginRoom, useCommentMargin } from '../../src/components/shell/commentMargin';
import { COMMENT_MARGIN_GAP, COMMENT_MARGIN_W } from '../../src/editor/schema/comments';

/** The page, its column's padding and the comments margin beside it (step 4.5). */
const COMMENT_MARGIN_ROOM = Layout.documentMaxWidth + 48 + COMMENT_MARGIN_GAP + COMMENT_MARGIN_W;

// The bar's own height, above the home indicator (React Navigation's default).
const TAB_BAR_HEIGHT = 49;

function tabIcon(tab: MainTab) {
  function TabIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
    return <Ionicons name={focused ? tab.icon.active : tab.icon.inactive} size={size} color={color} />;
  }
  return TabIcon;
}

/**
 * Tab labels grow with Larger Text up to 1.3× (the bar keeps its height,
 * so bigger labels would be cut off). Beside the icon on wider windows.
 */
function TabLabel({ color, children, position }: { color: string; children: string; position: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text
      style={[styles.tabLabel, position === 'beside-icon' && styles.tabLabelBeside, { color }]}
      maxFontSizeMultiplier={1.3}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

// Record: a big red circle with a white ring, raised above the bar in its exact middle.
function RecordTabButton({
  onPress,
  onLongPress,
  accessibilityState,
  testID,
}: Pick<PressableProps, 'onPress' | 'onLongPress' | 'accessibilityState' | 'testID'>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.recordSlot} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Record lecture"
        {...a11yState(accessibilityState)}
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
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const wide = useLayoutMode() === 'wide';
  const kind = screenKindFor(pathname);
  const [prefs, setPrefs] = useLayoutPrefs();
  // The app's Undo toast: the sidebar's actions, and screens whose actions
  // leave them (the course screen's title menu) show their Undo here.
  const { showUndo, toast } = useUndoToast();
  const isFullScreen = isFullScreenRoute(pathname);
  const commentMargin = useCommentMargin();

  // Review (step 9.1, desktop-07/08) has no sidebar either: the card on the gradient, the top bar's logo back to the library.
  const showSidebar = wide && kind !== 'settings' && kind !== 'review' && prefs.sidebarOpen;
  const showAssistant = wide && kind === 'document' && prefs.assistantOpen;
  // A summary's Full answer link (step 7.7) opens the study assistant panel.
  useEffect(() => registerShellCommand('openAssistant', () => setPrefs({ assistantOpen: true })), [setPrefs]);
  const summaryBanner = useSummaryBanner();

  return (
    <ShellProvider>
      <AppUndoProvider value={showUndo}>
        <View style={styles.root}>
          {wide && (
            <TopBar
              kind={kind}
              sidebarOpen={prefs.sidebarOpen}
              assistantOpen={prefs.assistantOpen}
              onToggleSidebar={() => setPrefs({ sidebarOpen: !prefs.sidebarOpen })}
              onToggleAssistant={() => setPrefs({ assistantOpen: !prefs.assistantOpen })}
            />
          )}
          {/* Step 7.7 (desktop-03): a lecture's Summary tab holding its summary: the green banner, the window's full width. */}
          {wide && kind === 'document' && summaryBanner && <SummaryBanner summary={summaryBanner.summary} lecture={summaryBanner.lecture} />}
          {/* While a lecture records (step 5.3): on every screen, so leaving the lecture never stops it. */}
          {wide && <RecordingStrip />}
          <View style={styles.row}>
            {showSidebar && <Sidebar kind={kind} showUndo={showUndo} />}
            <View style={styles.center} onLayout={(e) => setCommentMarginRoom(e.nativeEvent.layout.width >= COMMENT_MARGIN_ROOM)}>
              {wide && <GradientFill />}
              <View
                style={[
                  styles.centerColumn,
                  wide && kind !== 'library' && kind !== 'review' && !(kind === 'document' && commentMargin.pages) && (kind === 'settings' ? styles.centerColumnSettings : styles.centerColumnNarrow),
                  // A document showing its comments margin (step 4.5); in Pages it has the whole pane (step 4.5b).
                  wide && kind === 'document' && !commentMargin.pages && commentMargin.shown && commentMargin.room && styles.centerColumnWithComments,
                ]}
              >
                <Tabs
                  screenOptions={{
                    headerShown: false,
                    // No white flash between screens in dark mode
                    sceneStyle: { backgroundColor: c.gradient.top },
                    tabBarActiveTintColor: c.accentDark,
                    tabBarInactiveTintColor: c.text.secondary,
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
                      tabBarLabel: TabLabel,
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
              {/* In the centre column on the laptop, so a toast never covers the assistant's composer. */}
              {wide && toast}
            </View>
            {showAssistant && <AssistantPanel onClose={() => setPrefs({ assistantOpen: false })} />}
          </View>
          {!wide && <OfflineBanner bottom={(isFullScreen ? 0 : TAB_BAR_HEIGHT) + insets.bottom + 8} />}
          {!wide && <RecordingPill />}
          <RecordingHost />
          {/* Stop & summarize (step 7.3): over any screen, during a recording or after it. */}
          <SummarizePanel />
          {/* Step 9.2-3: the review reminders (iPhone), planned again as things change; a tap opens Review. */}
          <RemindersHost />
          <LecturePicker />
          {/* New folder outside a course (Lea, 10 Nov): "New folder in…". */}
          <NewFolderHost />
          <NewQuizPanel />
          {!wide && toast}
          {Platform.OS === 'web' && <KeyboardShortcuts />}
          {__DEV__ && <DragDebugOverlay />}
          {__DEV__ && <SimulatedAiBadge top={wide ? Layout.topBarHeight + 6 : insets.top + 2} />}
        </View>
      </AppUndoProvider>
    </ShellProvider>
  );
}

const RING = 4;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    tabLabel: {
      fontSize: Typography.size.xxs,
      fontWeight: Typography.weight.medium,
      textAlign: 'center',
    },
    tabLabelBeside: { fontSize: Typography.size.sm, marginLeft: 20 },
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  center: { flex: 1, minWidth: 0 },
  centerColumn: { flex: 1, width: '100%', alignSelf: 'center' },
  // Documents and settings: a centered column on the gradient (the page is 820 px).
  centerColumnNarrow: { maxWidth: Layout.documentMaxWidth + 48 },
  centerColumnWithComments: { maxWidth: COMMENT_MARGIN_ROOM },
  // Settings: the section menu beside the page (docs/design desktop-05).
  centerColumnSettings: { maxWidth: Layout.settingsMaxWidth + 48 },
  tabBar: {
    backgroundColor: c.white,
    borderTopColor: c.surfaceMuted,
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
    backgroundColor: c.recordRing,
    shadowColor: c.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  recordPressed: { opacity: 0.85 },
  recordCircle: {
    flex: 1,
    borderRadius: (Layout.recordButtonSize - RING * 2) / 2,
    backgroundColor: c.recording,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.onRecording,
  },
});
