import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { betaNoticeSeen, dismissBetaNotice } from '../../services/credits.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { unitsText } from '../../lib/credits/format';

/**
 * The beta friends' notice (plan §6; no mockup: the Review offer card's look), at the top of Library on both
 * devices: the beta friends are thanked once per account, with her balance now. See credits or Got it
 * hides it for good (profiles.preferences.betaCreditsSeen; on this device at once, also offline).
 */
export function BetaCreditsNotice() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { credits } = useCredits();
  const beta = credits?.beta === true;
  const [show, setShow] = useState(false);

  useEffect(() => {
    let live = true;
    if (!userId || !beta) {
      setShow(false);
      return;
    }
    betaNoticeSeen(userId)
      .then((seen) => live && setShow(!seen))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId, beta]);

  if (!show || !credits || !userId) return null;
  const units = Math.max(0, credits.units);
  const lectures = `${unitsText(units)} ${units === 4 ? 'lecture' : 'lectures'}`;
  const dismiss = (then?: () => void) => {
    setShow(false);
    void dismissBetaNotice(userId);
    then?.();
  };
  return (
    <View style={styles.card} {...{ dataSet: { credits: 'beta-notice' } }}>
      <View style={styles.head}>
        <Ionicons name="gift-outline" size={20} color={c.accentDark} />
        <Text style={styles.title} accessibilityRole="header">
          Thanks for testing Studiply
        </Text>
      </View>
      <Text style={styles.body}>
        You have {lectures} to use: 10 from us and 2 free ones. A lecture is its transcript, its first summary and the study assistant on it.
      </Text>
      <View style={styles.buttons}>
        <Pressable onPress={() => dismiss(() => router.push('/settings/credits'))} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.secondaryText}>See credits</Text>
        </Pressable>
        <Pressable onPress={() => dismiss()} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.primaryText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: { padding: 16, borderRadius: 14, backgroundColor: c.card, gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    body: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: 19 },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    secondary: { height: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    primary: { height: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: c.button.primary, justifyContent: 'center' },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    pressed: { opacity: 0.7 },
  });
