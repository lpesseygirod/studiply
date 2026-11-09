/**
 * LegalLinks.tsx
 * A small row of links to the legal pages (step 10.1b-1): "Terms · Privacy · Legal" under
 * Settings (iphone-07's footer; under the laptop's settings menu, desktop-05), "Terms of Service ·
 * Privacy Policy" on sign-up, the other pages under each legal page. On the gradient.
 * `onOpen` defaults to the page's route, with where it was opened from (‹ Back returns there);
 * sign-up opens them in a sheet so the form is kept.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { LEGAL_SHORT, legalHref } from '../../legal/pages';
import { LEGAL_TEXTS } from '../../legal/texts.generated';
import type { LegalSlug } from '../../legal/types';

interface Props {
  slugs: readonly LegalSlug[];
  /** The full names ("Privacy Policy") instead of the short ones. */
  long?: boolean;
  onOpen?: (slug: LegalSlug) => void;
}

export function LegalLinks({ slugs, long = false, onOpen }: Props) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const here = usePathname();
  const open = onOpen ?? ((slug: LegalSlug) => router.push(legalHref(slug, here)));
  return (
    <View style={styles.row} accessibilityRole="none">
      {slugs.map((slug, i) => (
        <React.Fragment key={slug}>
          {i > 0 && (
            <Text style={styles.dot} accessibilityElementsHidden importantForAccessibility="no">
              ·
            </Text>
          )}
          <Text style={styles.link} onPress={() => open(slug)} accessibilityRole="link" {...{ dataSet: { legalLink: slug } }}>
            {long ? LEGAL_TEXTS[slug].title : LEGAL_SHORT[slug]}
          </Text>
        </React.Fragment>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    link: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.medium,
      color: c.text.onGradientStrong,
      textDecorationLine: 'underline',
      paddingVertical: 6,
    },
    dot: {
      fontSize: Typography.size.sm,
      color: c.text.onGradient,
    },
  });
