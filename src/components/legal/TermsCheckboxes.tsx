/**
 * TermsCheckboxes.tsx
 * Step 10.1b-2: the two required boxes, unticked until she ticks them: "I agree to the Terms of
 * Service and the Privacy Policy" (both linked; they open in a LegalSheet via `onOpen`) and "I am 16
 * or older". On sign-up (desktop-06, and where iphone-11's footer line was) and at the gate.
 * With the first ticked and not the second, it says why: Studiply is for people aged 16 or older.
 *
 * The links are siblings of the words that tick the box, not inside a pressable row: a click on a
 * link opens the text and never ticks the box (on the web a click bubbles to its parents).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { LegalSlug } from '../../legal/types';
import { UNDER_AGE_MESSAGE } from '../../services/terms.service';

export const AGREE_LABEL = 'I agree to the Terms of Service and the Privacy Policy';
export const AGE_LABEL = 'I am 16 or older';

interface Props {
  terms: boolean;
  age: boolean;
  onTerms: (on: boolean) => void;
  onAge: (on: boolean) => void;
  onOpen: (slug: LegalSlug) => void;
  /** 'gradient': straight on the gradient (sign-up); 'card': on a white card (the gate). */
  tone?: 'gradient' | 'card';
  disabled?: boolean;
}

export function TermsCheckboxes({ terms, age, onTerms, onAge, onOpen, tone = 'gradient', disabled = false }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const ink = tone === 'gradient' ? c.text.onGradientStrong : c.text.primary;
  const linkStyle = [styles.link, { color: tone === 'gradient' ? c.text.onGradientStrong : c.accentDark }];

  const box = (checked: boolean, onChange: (on: boolean) => void, label: string, tag: string) => (
    <Pressable
      onPress={() => !disabled && onChange(!checked)}
      hitSlop={8}
      style={styles.box}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      {...{ dataSet: { terms: tag, checked: checked ? 'true' : 'false' } }}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={ink} />
    </Pressable>
  );
  const words = (text: string, onPress: () => void) => (
    <Text onPress={disabled ? undefined : onPress}>{text}</Text>
  );
  const link = (text: string, slug: LegalSlug) => (
    <Text style={linkStyle} onPress={() => onOpen(slug)} accessibilityRole="link" {...{ dataSet: { legalLink: slug } }}>
      {text}
    </Text>
  );

  return (
    <View style={styles.group}>
      <View style={styles.row}>
        {box(terms, onTerms, AGREE_LABEL, 'agree')}
        <Text style={[styles.label, { color: ink }]}>
          {/* Each link on one line (non-breaking spaces), so it is one tap target at 390 too. */}
          {words('I agree to the ', () => onTerms(!terms))}
          {link('Terms of Service', 'terms')}
          {words(' and the ', () => onTerms(!terms))}
          {link('Privacy Policy', 'privacy')}
        </Text>
      </View>
      <View style={styles.row}>
        {box(age, onAge, AGE_LABEL, 'age')}
        <Text style={[styles.label, { color: ink }]}>{words(AGE_LABEL, () => onAge(!age))}</Text>
      </View>
      {terms && !age && (
        <Text style={[styles.hint, { color: tone === 'gradient' ? c.text.onGradientStrong : c.text.secondary }]} accessibilityLiveRegion="polite" {...{ dataSet: { terms: 'under-age' } }}>
          {UNDER_AGE_MESSAGE}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (_c: ThemeColors) =>
  StyleSheet.create({
    group: { gap: 10 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    box: { minWidth: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' },
    label: {
      flex: 1,
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.medium,
      lineHeight: 22,
    },
    link: { textDecorationLine: 'underline', fontWeight: Typography.weight.semibold },
    hint: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, marginLeft: 34 },
  });
