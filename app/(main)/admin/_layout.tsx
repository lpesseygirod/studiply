import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, Slot, usePathname, useRouter } from 'expo-router';

import { useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { Layout } from '../../../src/constants/layout';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { useIsAdmin } from '../../../src/hooks/useIsAdmin';
import { a11yState } from '../../../src/utils/a11y';
import { GradientFill } from '../../../src/components/GradientBackground';
import { ADMIN_SECTIONS, adminSectionForPath } from '../../../src/utils/adminSections';

/**
 * Lea's dashboard (docs/reports/plan-10.2-codes-admin.md; no mockup: Settings' layout, desktop-05): the
 * laptop's web only, admins only (the server's admin_* functions refuse anyone else anyway). A menu card
 * on the left (part A: Codes; part B adds the money sections), the section on the right.
 */
export default function AdminLayout() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const router = useRouter();
  const wide = useLayoutMode() === 'wide';
  const isAdmin = useIsAdmin();
  const open = adminSectionForPath(usePathname());

  if (Platform.OS !== 'web') return <Redirect href="/settings" />;
  const notice = (text: string) => (
    <View style={styles.root}>
      <GradientFill />
      <View style={styles.noticeCard} {...{ dataSet: { admin: 'notice' } }}>
        <Text style={styles.noticeText}>{text}</Text>
      </View>
    </View>
  );
  if (isAdmin === null) {
    return (
      <View style={[styles.root, styles.center]}>
        <GradientFill />
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  if (!isAdmin) return notice('This page isn’t available.');
  if (!wide) return notice('The dashboard is made for a laptop. Open Studiply in a wider window.');

  return (
    <View style={styles.root}>
      <GradientFill />
      <View style={styles.columns}>
        <View style={styles.menu}>
          <View style={styles.card} accessibilityRole="menu" {...{ dataSet: { admin: 'menu' } }}>
            <Pressable onPress={() => router.navigate('/settings')} style={styles.item} accessibilityRole="link">
              <Text style={styles.back}>‹ Settings</Text>
            </Pressable>
            {ADMIN_SECTIONS.map((s) => {
              const active = s.key === open;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => router.navigate(s.href)}
                  style={({ hovered }: { hovered?: boolean }) => [styles.item, active ? styles.itemActive : hovered && styles.itemHover]}
                  accessibilityRole="link"
                  {...a11yState({ selected: active })}
                  aria-current={active ? 'page' : undefined}
                >
                  <Text style={[styles.label, active && styles.labelActive]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.page}>
          <Slot />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    columns: { flex: 1, flexDirection: 'row', gap: 24, paddingHorizontal: 24, paddingTop: 24 },
    menu: { width: Layout.settingsMenuWidth, gap: 12 },
    page: { flex: 1, minWidth: 0 },
    card: { backgroundColor: c.card, borderRadius: 16, padding: 10, gap: 2, alignSelf: 'flex-start', width: '100%' },
    item: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
    itemHover: { backgroundColor: c.cardMuted },
    itemActive: { backgroundColor: c.accentLight },
    label: { fontSize: Typography.size.base, color: c.text.primary },
    labelActive: { color: c.accentDark, fontWeight: Typography.weight.semibold },
    back: { fontSize: Typography.size.sm, color: c.accentDark },
    noticeCard: { margin: 24, padding: 20, borderRadius: 16, backgroundColor: c.card, alignSelf: 'center', maxWidth: 520 },
    noticeText: { fontSize: Typography.size.base, color: c.text.primary, textAlign: 'center' },
  });
