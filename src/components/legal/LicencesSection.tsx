/**
 * LicencesSection.tsx
 * "Open-source licences" on /legal, from src/legal/licences.generated.ts (package
 * metadata, npm run build:legal). First the licences whose text must be shown (libheif-js and
 * libheif, LGPL-3.0), with where their source is and the full text behind "Show the licence";
 * then every package with its version, licence and copyright, behind "Show all N packages".
 */

import React, { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { LICENCE_NOTICES, OPEN_SOURCE_PACKAGES } from '../../legal/licences.generated';

export function LicencesSection() {
  const styles = useThemedStyles(makeStyles);
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const open = (url: string) => void Linking.openURL(url).catch(() => {});

  return (
    <View style={styles.section} {...{ dataSet: { legal: 'licences' } }}>
      <Text style={styles.heading} accessibilityRole="header">
        Open-source licences
      </Text>
      <Text style={styles.paragraph}>
        Studiply is built with open-source software. These packages are used under their licences; the ones below must be shown in full, with where to get their source.
      </Text>

      {LICENCE_NOTICES.map((n) => {
        const id = `${n.name}@${n.version}`;
        const shown = openNotice === id;
        return (
          <View key={id} style={styles.notice} {...{ dataSet: { licenceNotice: n.name } }}>
            <Text style={styles.noticeTitle}>
              {n.name} {n.version} · {n.license}
            </Text>
            {n.about !== '' && <Text style={styles.paragraph}>{n.about}</Text>}
            {n.sources.map((url) => (
              <Text key={url} style={styles.paragraph}>
                Source:{' '}
                <Text style={styles.link} accessibilityRole="link" onPress={() => open(url)} {...{ dataSet: { legalHref: url } }}>
                  {url}
                </Text>
              </Text>
            ))}
            <Toggle open={shown} onPress={() => setOpenNotice(shown ? null : id)} label={shown ? 'Hide the licence' : 'Show the licence'} tag="show-licence" />
            {shown && (
              <Text style={styles.licenceText} selectable>
                {n.text.trim()}
              </Text>
            )}
          </View>
        );
      })}

      <Toggle
        open={showAll}
        onPress={() => setShowAll((s) => !s)}
        label={showAll ? 'Hide the packages' : `Show all ${OPEN_SOURCE_PACKAGES.length} packages`}
        tag="show-packages"
      />
      {showAll && (
        <View style={styles.packages}>
          {OPEN_SOURCE_PACKAGES.map((p) => (
            <View key={`${p.name}@${p.version}`} style={styles.package}>
              <Text style={styles.packageLine}>
                {p.source ? (
                  <Text style={styles.link} accessibilityRole="link" onPress={() => open(p.source as string)}>
                    {p.name}
                  </Text>
                ) : (
                  <Text style={styles.packageName}>{p.name}</Text>
                )}{' '}
                {p.version} · {p.license}
              </Text>
              {p.copyright && <Text style={styles.copyright}>{p.copyright}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Toggle({ open, onPress, label, tag }: { open: boolean; onPress: () => void; label: string; tag: string }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={styles.toggle}
      accessibilityRole="button"
      {...a11yState({ expanded: open })}
      {...{ dataSet: { legal: tag } }}
    >
      <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={c.accentDark} />
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    section: { gap: 12, marginTop: 14 },
    heading: {
      fontSize: Typography.size.lg,
      fontWeight: Typography.weight.bold,
      color: c.text.primary,
    },
    paragraph: {
      fontSize: Typography.size.base,
      lineHeight: 23,
      color: c.text.primary,
    },
    link: { color: c.accentDark, textDecorationLine: 'underline' },
    notice: {
      gap: 8,
      padding: 14,
      borderRadius: 12,
      backgroundColor: c.cardMuted,
    },
    noticeTitle: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
    },
    toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      minHeight: 44,
    },
    toggleText: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: c.accentDark,
    },
    licenceText: {
      fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
      fontSize: Typography.size.xs,
      lineHeight: 16,
      color: c.text.primary,
    },
    packages: { gap: 8 },
    package: { gap: 1 },
    packageLine: { fontSize: Typography.size.sm, color: c.text.primary },
    packageName: { fontWeight: Typography.weight.semibold },
    copyright: { fontSize: Typography.size.xs, color: c.text.secondary },
  });
