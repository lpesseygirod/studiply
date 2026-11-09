/**
 * TermsGateHost.tsx
 * Step 10.1b-2: the one-time gate for an account that never accepted the Terms and the Privacy
 * Policy: a first Sign in with Apple (the account is made at Apple's sheet, before the app can ask)
 * and accounts made before this step. Over everything, after sign-in: the same two boxes as
 * sign-up, Continue (greyed until both are ticked; saves her acceptance with the server's time),
 * and "I don't agree", which signs her out (D3). It can't be closed otherwise (Escape does nothing;
 * the texts open in a sheet over it, which Escape closes).
 *
 * Only shown when the server says there is no acceptance: offline it waits (services/terms).
 * Laptop: a white card on the gradient (the consent screen's, desktop-09). iPhone: full screen,
 * the card full width. No mockup of its own. Mounted once in app/_layout.tsx, inside AuthProvider.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { onBackOnline } from '../../lib/connectivity';
import { acceptTerms, checkTerms, MINIMUM_AGE, type TermsStatus } from '../../services/terms.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { LegalSlug } from '../../legal/types';
import { GradientFill } from '../GradientBackground';
import { LogoTile } from '../LogoTile';
import { LegalSheet } from './LegalSheet';
import { TermsCheckboxes } from './TermsCheckboxes';

export const GATE_TITLE = 'Before you continue';

export function TermsGateHost() {
  const { session, isOnboarded, signOut } = useAuth();
  const userId = isOnboarded ? (session?.user.id ?? null) : null;
  const [checked, setChecked] = useState<{ userId: string; status: TermsStatus } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const check = () => {
      checkTerms(userId)
        .then((status) => {
          if (!cancelled) setChecked({ userId, status });
        })
        .catch(() => {});
    };
    check();
    // Offline at sign-in ('unknown'): asked again once the server answers.
    const off = onBackOnline(check);
    return () => {
      cancelled = true;
      off();
    };
  }, [userId]);

  if (!userId || checked?.userId !== userId || checked.status !== 'missing') return null;
  return (
    <TermsGate
      key={userId}
      userId={userId}
      onAccepted={() => setChecked({ userId, status: 'accepted' })}
      onDecline={() => void signOut()}
    />
  );
}

function TermsGate({ userId, onAccepted, onDecline }: { userId: string; onAccepted: () => void; onDecline: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useLayoutMode() === 'wide';
  const [terms, setTerms] = useState(false);
  const [age, setAge] = useState(false);
  const [legal, setLegal] = useState<LegalSlug | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canContinue = terms && age && !busy;

  const accept = async () => {
    if (!canContinue) return;
    setBusy(true);
    setError(null);
    try {
      await acceptTerms(userId, 'gate');
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your answer couldn’t be saved. Please try again.');
      setBusy(false);
    }
  };

  return (
    // Not closable: the only ways out are Continue and "I don't agree".
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.fill} accessibilityViewIsModal {...{ dataSet: { gate: 'screen', layout: wide ? 'card' : 'full' } }}>
        <GradientFill />
        <ScrollView contentContainerStyle={[styles.center, !wide && { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.card, !wide && styles.cardFull]}>
            <View style={styles.brand}>
              <LogoTile size={40} />
              <Text style={styles.brandText}>Studiply</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {GATE_TITLE}
            </Text>
            <Text style={styles.text}>
              To use Studiply, please read and accept our Terms of Service and Privacy Policy. Studiply is for people aged {MINIMUM_AGE} or older.
            </Text>
            <TermsCheckboxes terms={terms} age={age} onTerms={setTerms} onAge={setAge} onOpen={setLegal} tone="card" disabled={busy} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              onPress={accept}
              disabled={!canContinue}
              style={({ pressed }) => [styles.continue, !canContinue && styles.continueOff, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canContinue }}
              {...{ dataSet: { gate: 'continue' } }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={c.button.primaryText} />
              ) : (
                <Text style={[styles.continueText, !canContinue && styles.continueTextOff]}>Continue</Text>
              )}
            </Pressable>
            <Pressable
              onPress={onDecline}
              disabled={busy}
              style={({ pressed }) => [styles.decline, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityHint="Signs you out"
              {...{ dataSet: { gate: 'decline' } }}
            >
              <Text style={styles.declineText}>I don’t agree (sign out)</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
      <LegalSheet slug={legal} onClose={() => setLegal(null)} closeLabel={GATE_TITLE} />
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    fill: { flex: 1 },
    center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: {
      width: '100%',
      maxWidth: 440,
      padding: 32,
      borderRadius: 20,
      backgroundColor: c.card,
      gap: 16,
      shadowColor: c.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 10 },
    },
    cardFull: { padding: 24 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    brandText: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    title: { fontSize: Typography.size.xl, fontWeight: Typography.weight.bold, color: c.text.primary },
    text: { fontSize: Typography.size.base, color: c.text.secondary, lineHeight: 21 },
    error: { fontSize: Typography.size.sm, color: c.error },
    continue: { height: 48, borderRadius: 12, backgroundColor: c.button.primary, alignItems: 'center', justifyContent: 'center' },
    continueOff: { backgroundColor: c.button.disabled },
    continueText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    continueTextOff: { color: c.button.disabledText },
    decline: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    declineText: { fontSize: Typography.size.base, color: c.text.secondary },
    pressed: { opacity: 0.75 },
  });
