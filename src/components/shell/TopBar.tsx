import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useGlobalSearchParams, useRouter, type Href } from 'expo-router';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { LightColors, type ThemeColors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { Typography } from '../../constants/typography';
import type { ScreenKind } from '../../hooks/useLayoutMode';
import UserAvatar from '../UserAvatar';
import { recordHref, useShell, type Crumb } from './ShellContext';

/**
 * The laptop's top bar (docs/design desktop-01/04/05). What sits in the
 * middle depends on the kind of screen:
 *  - library: the search field and the red Record button (it
 *    preselects the course and folder the student is in);
 *  - document: the breadcrumb, title and "Saved · time" the open
 *    document publishes (ShellContext), Share, the assistant toggle;
 *  - settings: Back to library and the page title;
 *  - review (step 9.1, desktop-07/08): "Review today · Course › Lecture" over the lecture's title,
 *    and the Quiz me | Flashcards control; no sidebar toggle (Review has no sidebar).
 */
export function TopBar({
  kind,
  sidebarOpen,
  assistantOpen,
  onToggleSidebar,
  onToggleAssistant,
}: {
  kind: ScreenKind;
  sidebarOpen: boolean;
  assistantOpen: boolean;
  onToggleSidebar: () => void;
  onToggleAssistant: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { location, header } = useShell();
  const crumbs: Crumb[] = header?.crumbs ?? [{ label: 'My library', href: '/library' }];

  return (
    <View style={styles.bar} testID="top-bar">
      <View style={[styles.brand, kind !== 'settings' && kind !== 'review' && sidebarOpen && styles.brandOverSidebar]}>
        {kind !== 'settings' && kind !== 'review' && (
          <IconButton
            icon="menu-outline"
            label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            onPress={onToggleSidebar}
          />
        )}
        <Pressable style={styles.logoLink} onPress={() => router.navigate('/library')} accessibilityRole="link" accessibilityLabel="Studiply, My library">
          <LinearGradient
            colors={[LightColors.gradient.top, LightColors.gradient.bottomMid]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoTile}
          >
            <Ionicons name="book" size={15} color={LightColors.white} />
          </LinearGradient>
          <Text style={styles.logoText}>Studiply</Text>
        </Pressable>
      </View>

      <View style={styles.middle}>
        {kind === 'library' && (
          <Pressable style={styles.search} onPress={() => router.navigate('/search')} accessibilityRole="search">
            <Text style={styles.searchText} numberOfLines={1}>
              Search notes, lectures, terms…
            </Text>
          </Pressable>
        )}
        {kind === 'document' && (
          <View style={styles.titleBlock} testID="document-header">
            <View style={styles.crumbs}>
              {crumbs.map((crumb, i) => (
                <View key={`${crumb.label}-${i}`} style={styles.crumbItem}>
                  {i > 0 && <Text style={styles.crumb}>›</Text>}
                  <Pressable onPress={() => router.navigate(crumb.href)} accessibilityRole="link">
                    <Text style={styles.crumb} numberOfLines={1}>
                      {crumb.label}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {header?.title ?? ''}
              </Text>
              {!!header?.saved && <Text style={styles.saved}>{header.saved}</Text>}
            </View>
          </View>
        )}
        {kind === 'settings' && (
          <View style={styles.titleBlock}>
            <Pressable onPress={() => router.navigate('/library')} accessibilityRole="link">
              <Text style={styles.back}>‹ Back to library</Text>
            </Pressable>
            <Text style={styles.title}>Settings</Text>
          </View>
        )}
        {kind === 'review' && (
          // Step 9.1 (desktop-07/08): "Review today · Course › Lecture" over the card's lecture, as the review screen publishes it.
          <View style={styles.titleBlock} testID="review-header">
            <Text style={styles.crumb} numberOfLines={1}>
              {header?.crumbs.map((c) => c.label).join(' › ') ?? 'Review today'}
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {header?.title || 'Review'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {kind === 'review' && <ReviewModes />}
        {kind === 'library' && (
          <TouchableOpacity
            style={styles.recordPill}
            onPress={() => router.navigate(recordHref(location))}
            activeOpacity={0.85}
            accessibilityRole="link"
            accessibilityLabel="Record lecture"
          >
            <View style={styles.recordDot} />
            <Text style={styles.recordText}>Record</Text>
          </TouchableOpacity>
        )}
        {kind === 'document' && (
          <>
            <IconButton
              icon={assistantOpen ? 'sparkles' : 'sparkles-outline'}
              label={assistantOpen ? 'Hide study assistant' : 'Show study assistant'}
              onPress={onToggleAssistant}
            />
            <View style={[styles.outlineButton, styles.disabled]} accessibilityState={{ disabled: true }}>
              <Text style={styles.outlineText}>Share</Text>
            </View>
          </>
        )}
        <Pressable onPress={() => router.navigate('/settings/account')} accessibilityRole="link" accessibilityLabel="Account">
          <UserAvatar size={34} />
        </Pressable>
      </View>
    </View>
  );
}

/** Review's two modes (desktop-07/08): Quiz me | Flashcards, kept in the address (?mode=quiz). */
function ReviewModes() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { mode } = useGlobalSearchParams<{ mode?: string }>();
  const quiz = mode === 'quiz';
  const option = (label: string, on: boolean, href: Href) => (
    <Pressable
      onPress={() => router.replace(href)}
      style={[styles.mode, on && styles.modeOn]}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      aria-selected={on}
      accessibilityLabel={label}
    >
      <Text style={[styles.modeText, on && styles.modeTextOn]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.modes} accessibilityRole="tablist">
      {option('Quiz me', quiz, '/review?mode=quiz')}
      {option('Flashcards', !quiz, '/review')}
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={styles.iconButton}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={c.text.secondary} />
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  bar: {
    height: Layout.topBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.white,
    borderBottomWidth: 1,
    borderBottomColor: c.surfaceMuted,
    paddingHorizontal: 12,
    gap: 16,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Lines the middle up with the content next to the sidebar.
  brandOverSidebar: { width: Layout.sidebarWidth - 12 - 16 },
  logoLink: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoTile: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: Typography.size.md, fontWeight: Typography.weight.bold, color: c.text.primary },

  middle: { flex: 1, minWidth: 0 },
  search: {
    maxWidth: 640,
    height: 38,
    justifyContent: 'center',
    backgroundColor: c.search.bg,
    borderWidth: 1,
    borderColor: c.search.border,
    borderRadius: 100,
    paddingHorizontal: 16,
  },
  searchText: { fontSize: Typography.size.sm, color: c.search.placeholder },
  titleBlock: { gap: 1 },
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' },
  crumbItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  crumb: { fontSize: Typography.size.xs, color: c.text.secondary },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  saved: { fontSize: Typography.size.xs, color: c.text.secondary },
  back: { fontSize: Typography.size.xs, color: c.accentDark, fontWeight: Typography.weight.medium },
  title: { flexShrink: 1, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.recording,
    borderRadius: 100,
    paddingHorizontal: 16,
    height: 38,
  },
  recordDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.onRecording },
  recordText: { color: c.onRecording, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
  outlineButton: {
    borderWidth: 1,
    borderColor: c.surfaceMuted,
    borderRadius: 100,
    paddingHorizontal: 16,
    height: 36,
    justifyContent: 'center',
  },
  outlineText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.primary },
  disabled: { opacity: 0.45 },
  iconButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // Review's modes (desktop-07/08): a grey segmented control, the chosen one white.
  modes: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: c.surfaceMuted, gap: 2 },
  mode: { height: 32, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center' },
  modeOn: { backgroundColor: c.card },
  modeText: { fontSize: Typography.size.sm, color: c.text.secondary },
  modeTextOn: { fontWeight: Typography.weight.semibold, color: c.text.primary },
});
