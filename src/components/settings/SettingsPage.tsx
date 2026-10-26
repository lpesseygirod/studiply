/**
 * SettingsPage.tsx
 * The frame of every settings page (step 3.6).
 *
 *   iPhone: the gradient, "‹ Settings" (or the page it was opened from),
 *     the big title, then the cards, scrolling.
 *   Laptop: the right column of the settings layout (the gradient and the
 *     menu are the layout's): the title and the cards; pages inside a
 *     section (Recently Deleted) also get their "‹ Your data" link.
 *   `right` sits beside the title ("Empty", the ✓ after a save).
 *
 * `scroll={false}` for pages that bring their own list (Recently Deleted).
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';

import { useLayoutMode } from '../../hooks/useLayoutMode';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { GradientFill } from '../GradientBackground';

interface Props {
  title: string;
  /** Where "‹" goes: Settings by default. */
  back?: { label: string; href: Href };
  /** Beside the title (e.g. "Empty", the ✓ after a save). */
  right?: React.ReactNode;
  scroll?: boolean;
  children: React.ReactNode;
}

const SETTINGS_BACK = { label: 'Settings', href: '/settings' as Href };

export function SettingsPage({ title, back, right, scroll = true, children }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const wide = useLayoutMode() === 'wide';
  const target = back ?? SETTINGS_BACK;
  // The laptop's menu replaces "‹ Settings"; a page inside a section keeps its way back.
  const showBack = !wide || !!back;

  const goBack = () => {
    if (!wide && router.canGoBack()) router.back();
    else router.navigate(target.href);
  };

  const header = (
    <View style={[styles.header, !wide && { paddingTop: insets.top + 8 }]}>
      {showBack && (
        <TouchableOpacity
          style={styles.back}
          onPress={goBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${target.label}`}
        >
          <Ionicons name="chevron-back" size={20} color={wide ? c.accentDark : c.text.onGradientStrong} />
          <Text style={[styles.backText, wide && styles.backTextWide]}>{target.label}</Text>
        </TouchableOpacity>
      )}
      {/* On the laptop a section page starts with its title, level with the menu. */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, wide && styles.titleWide]} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {!wide && <GradientFill />}
      {!wide && <ThemedStatusBar />}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, wide && styles.contentWide, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <>
          <View style={[styles.fixedHeader, wide && styles.contentWide]}>{header}</View>
          <View style={styles.fill}>{children}</View>
        </>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    fill: { flex: 1 },
    content: {
      paddingHorizontal: 20,
      gap: 16,
    },
    contentWide: {
      paddingHorizontal: 0,
      paddingTop: 0,
    },
    fixedHeader: {
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    header: {
      gap: 6,
      marginBottom: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    back: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      minHeight: 44,
    },
    backText: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
      color: c.text.onGradientStrong,
    },
    backTextWide: {
      fontSize: Typography.size.sm,
      color: c.accentDark,
    },
    right: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    // The big title, as on Library and Search (docs/design iphone-07)
    title: {
      flex: 1,
      fontSize: Typography.size['3xl'],
      fontWeight: Typography.weight.extrabold,
      color: c.text.onGradientStrong,
    },
    titleWide: {
      fontSize: Typography.size['2xl'],
      fontWeight: Typography.weight.bold,
    },
  });
