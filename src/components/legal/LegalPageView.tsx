/**
 * LegalPageView.tsx
 * One legal page: "‹ Back" on the gradient, the text on a white page (a 760 px
 * column on the laptop, full width on the iPhone), then links to the other legal pages. /legal
 * also has the open-source licences and the texts' version. No mockup: it follows the document
 * page. Used by the routes (app/(legal)) and by LegalSheet (sign-up, the consent screen).
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { LEGAL_SLUGS } from '../../legal/pages';
import { LEGAL_TEXTS, LEGAL_VERSION } from '../../legal/texts.generated';
import type { LegalSlug } from '../../legal/types';
import { GradientFill } from '../GradientBackground';
import { LegalDocument } from './LegalDocument';
import { LegalLinks } from './LegalLinks';
import { LicencesSection } from './LicencesSection';

interface Props {
  slug: LegalSlug;
  backLabel: string;
  onBack: () => void;
  onOpenPage: (slug: LegalSlug) => void;
}

export function LegalPageView({ slug, backLabel, onBack, onOpenPage }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useLayoutMode() === 'wide';
  const text = LEGAL_TEXTS[slug];

  return (
    <View style={styles.container} {...{ dataSet: { legalPage: slug } }}>
      <GradientFill />
      <ThemedStatusBar />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          wide && styles.contentWide,
          { paddingTop: (wide ? 24 : insets.top + 8), paddingBottom: insets.bottom + 32 },
        ]}
      >
        <View style={styles.column}>
          <TouchableOpacity
            style={styles.back}
            onPress={onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${backLabel}`}
            {...{ dataSet: { legal: 'back' } }}
          >
            <Ionicons name="chevron-back" size={20} color={c.text.onGradientStrong} />
            <Text style={styles.backText}>{backLabel}</Text>
          </TouchableOpacity>

          <View style={[styles.page, wide && styles.pageWide]}>
            <LegalDocument blocks={text.blocks} onOpenPage={onOpenPage} />
            {slug === 'legal' && <LicencesSection />}
            {slug === 'legal' && <Text style={styles.version}>Texts version {LEGAL_VERSION}</Text>}
          </View>

          <LegalLinks slugs={LEGAL_SLUGS.filter((s) => s !== slug)} long onOpen={onOpenPage} />
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 16 },
    contentWide: { paddingHorizontal: 24 },
    column: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
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
    page: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
    },
    pageWide: {
      borderRadius: 20,
      paddingHorizontal: 40,
      paddingVertical: 36,
    },
    version: {
      marginTop: 18,
      fontSize: Typography.size.xs,
      color: c.text.secondary,
    },
  });
