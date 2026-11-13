/**
 * SettingsMenu.tsx
 * The laptop's settings menu (docs/design desktop-05): a white card left of
 * the page, one row per section, the open one highlighted.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { sectionForPath, sectionHref, visibleSections } from '../../utils/settingsSections';
import { useIsAdmin } from '../../hooks/useIsAdmin';

export function SettingsMenu() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const open = sectionForPath(usePathname());
  const isAdmin = useIsAdmin() === true;

  return (
    <View style={styles.card} testID="settings-menu" accessibilityRole="menu">
      {visibleSections(__DEV__).map((section) => {
        const active = section.key === open;
        return (
          <Pressable
            key={section.key}
            style={({ hovered }: { hovered?: boolean }) => [styles.item, active ? styles.itemActive : hovered && styles.itemHover]}
            onPress={() => router.navigate(sectionHref(section.key))}
            accessibilityRole="link"
            {...a11yState({ selected: active })}
            // A menu of pages: the open one is the current page (aria-current, which links take).
            aria-current={active ? 'page' : undefined}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{section.label}</Text>
          </Pressable>
        );
      })}
      {/* Lea's dashboard (part A: its Codes): admins only, on the web. */}
      {isAdmin && (
        <Pressable
          style={({ hovered }: { hovered?: boolean }) => [styles.item, hovered && styles.itemHover]}
          onPress={() => router.navigate('/admin')}
          accessibilityRole="link"
          {...{ dataSet: { settings: 'admin' } }}
        >
          <Text style={styles.label}>Admin</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 10,
      gap: 2,
      alignSelf: 'flex-start',
      width: '100%',
    },
    item: {
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    itemHover: { backgroundColor: c.cardMuted },
    itemActive: { backgroundColor: c.accentLight },
    label: {
      fontSize: Typography.size.base,
      color: c.text.primary,
    },
    labelActive: {
      color: c.accentDark,
      fontWeight: Typography.weight.semibold,
    },
  });
