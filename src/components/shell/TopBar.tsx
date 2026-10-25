import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { Typography } from '../../constants/typography';
import type { ScreenKind } from '../../hooks/useLayoutMode';
import UserAvatar from '../UserAvatar';
import { useShell, type Crumb } from './ShellContext';

/**
 * The laptop's top bar (docs/design desktop-01/04/05). What sits in the
 * middle depends on the kind of screen:
 *  - library: the search field and the red Record lecture button (it
 *    preselects the course and folder the student is in);
 *  - document: the breadcrumb, title and "Saved · time" the open
 *    document publishes (ShellContext), Share, the assistant toggle;
 *  - settings: Back to library and the page title.
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
  const router = useRouter();
  const { location, header } = useShell();
  const crumbs: Crumb[] = header?.crumbs ?? [{ label: 'My library', href: '/library' }];
  const recordHref: Href = location?.courseId
    ? {
        pathname: '/record',
        params: { projectId: location.courseId, ...(location.folderId && { folderId: location.folderId }) },
      }
    : '/record';

  return (
    <View style={styles.bar} testID="top-bar">
      <View style={[styles.brand, kind !== 'settings' && sidebarOpen && styles.brandOverSidebar]}>
        {kind !== 'settings' && (
          <IconButton
            icon="menu-outline"
            label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            onPress={onToggleSidebar}
          />
        )}
        <Pressable style={styles.logoLink} onPress={() => router.navigate('/library')} accessibilityRole="link" accessibilityLabel="Studiply, My library">
          <LinearGradient
            colors={[Colors.gradient.top, Colors.gradient.bottomMid]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoTile}
          >
            <Ionicons name="book" size={15} color={Colors.white} />
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
      </View>

      <View style={styles.actions}>
        {kind === 'library' && (
          <TouchableOpacity
            style={styles.recordPill}
            onPress={() => router.navigate(recordHref)}
            activeOpacity={0.85}
            accessibilityRole="link"
          >
            <View style={styles.recordDot} />
            <Text style={styles.recordText}>Record lecture</Text>
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

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.iconButton}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Ionicons name={icon} size={18} color={Colors.text.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: Layout.topBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
    paddingHorizontal: 12,
    gap: 16,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Lines the middle up with the content next to the sidebar.
  brandOverSidebar: { width: Layout.sidebarWidth - 12 - 16 },
  logoLink: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoTile: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: Typography.size.md, fontWeight: Typography.weight.bold, color: Colors.text.primary },

  middle: { flex: 1, minWidth: 0 },
  search: {
    maxWidth: 640,
    height: 38,
    justifyContent: 'center',
    backgroundColor: Colors.salmonLight,
    borderWidth: 1,
    borderColor: Colors.salmon,
    borderRadius: 100,
    paddingHorizontal: 16,
  },
  searchText: { fontSize: Typography.size.sm, color: Colors.text.secondary },
  titleBlock: { gap: 1 },
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' },
  crumbItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  crumb: { fontSize: Typography.size.xs, color: Colors.text.secondary },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  saved: { fontSize: Typography.size.xs, color: Colors.text.secondary },
  back: { fontSize: Typography.size.xs, color: Colors.accentDark, fontWeight: Typography.weight.medium },
  title: { flexShrink: 1, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: Colors.text.primary },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.recording,
    borderRadius: 100,
    paddingHorizontal: 16,
    height: 38,
  },
  recordDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.white },
  recordText: { color: Colors.white, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
  outlineButton: {
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    borderRadius: 100,
    paddingHorizontal: 16,
    height: 36,
    justifyContent: 'center',
  },
  outlineText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: Colors.text.primary },
  disabled: { opacity: 0.45 },
  iconButton: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
