import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { GradientFill } from '../GradientBackground';
import { LogoTile } from '../LogoTile';
import { answerConsentRequest, subscribeConsentRequests, type ConsentRequest } from './consentRequests';
import { CONSENT_AGREE, CONSENT_INTRO, CONSENT_NO_TRAINING, CONSENT_SERVICES, PRIVACY_POLICY_URL } from './consentTexts';

/**
 * The AI consent screen (step 10.1; App Review guideline 5.1.2(i)), before anything is sent to an AI
 * service: what goes where (audio → ElevenLabs; transcript, notes, marks, slides and photos →
 * Anthropic), not used for training, withdraw any time.
 * - Laptop (desktop-09): a white card on the gradient, the logo, a checkbox "I agree…" that enables
 *   Allow and continue, and "Not now (record and take notes without AI)".
 * - iPhone (iphone-12): full screen on the gradient, the rows as white cards, Allow and continue and
 *   Not now at the bottom; the button is the explicit act (no checkbox, as the mockup).
 * Escape is Not now on the laptop. Mounted once in app/_layout.tsx.
 */
export function AiConsentHost() {
  const [request, setRequest] = useState<ConsentRequest | null>(null);
  useEffect(() => subscribeConsentRequests(setRequest), []);
  if (!request) return null;
  return <ConsentScreen key={request.id} request={request} />;
}

function ConsentScreen({ request }: { request: ConsentRequest }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useLayoutMode() === 'wide';
  const [agreed, setAgreed] = useState(false);
  const canAllow = !wide || agreed;
  const title = request.context === 'record' ? 'Before you record' : 'Before Studiply uses AI';
  const answer = (allowed: boolean) => answerConsentRequest(request.id, allowed);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      answerConsentRequest(request.id, false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [request.id]);

  const rows = CONSENT_SERVICES.map((s, i) => (
    <View key={s.to} style={wide ? styles.rowWide : styles.rowPhone} {...{ dataSet: { consentService: s.to } }}>
      {wide && (
        <View style={styles.number}>
          <Text style={styles.numberText}>{i + 1}</Text>
        </View>
      )}
      <Text style={styles.rowText}>
        <Text style={styles.bold}>
          {s.what} → {s.to}
        </Text>
        {wide ? ' ' : '\n'}
        {s.why}
      </Text>
    </View>
  ));

  const allow = (
    <Pressable
      onPress={() => canAllow && answer(true)}
      disabled={!canAllow}
      style={({ pressed }) => [styles.allow, !canAllow && styles.allowOff, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canAllow }}
      {...{ dataSet: { consent: 'allow' } }}
    >
      <Text style={[styles.allowText, !canAllow && styles.allowTextOff]}>Allow and continue</Text>
    </Pressable>
  );
  const notNow = (
    <Pressable onPress={() => answer(false)} style={({ pressed }) => [styles.notNow, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { consent: 'not-now' } }}>
      <Text style={styles.notNowText}>{wide ? 'Not now (record and take notes without AI)' : 'Not now'}</Text>
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => answer(false)}>
      <View style={styles.fill} accessibilityViewIsModal {...{ dataSet: { consent: 'screen', layout: wide ? 'card' : 'full' } }}>
        <GradientFill />
        {wide ? (
          <ScrollView contentContainerStyle={styles.center}>
            <View style={styles.card} accessibilityRole="none">
              <View style={styles.brand}>
                <LogoTile size={40} />
                <Text style={styles.brandText}>Studiply</Text>
              </View>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Text style={styles.intro}>{CONSENT_INTRO}</Text>
              <View style={styles.rows}>{rows}</View>
              <View style={styles.noTraining}>
                <View style={styles.tick}>
                  <Ionicons name="checkmark" size={14} color={c.status.success.text} />
                </View>
                <Text style={styles.noTrainingText}>{CONSENT_NO_TRAINING}</Text>
              </View>
              <View style={styles.agreeRow}>
                <Pressable
                  onPress={() => setAgreed((a) => !a)}
                  style={styles.agree}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreed }}
                  aria-checked={agreed}
                  {...{ dataSet: { consent: 'agree', checked: agreed ? 'true' : 'false' } }}
                >
                  <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={20} color={agreed ? c.accentDark : c.text.secondary} />
                  <Text style={styles.agreeText}>{CONSENT_AGREE}</Text>
                </Pressable>
                {PRIVACY_POLICY_URL !== null && (
                  <Text style={styles.link} accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL as string)}>
                    Privacy policy
                  </Text>
                )}
              </View>
              {allow}
              {notNow}
            </View>
          </ScrollView>
        ) : (
          <View style={[styles.phone, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16 }]}>
            <ScrollView contentContainerStyle={styles.phoneBody}>
              <Text style={styles.phoneTitle} accessibilityRole="header">
                {title}
              </Text>
              <Text style={styles.phoneIntro}>{CONSENT_INTRO}</Text>
              {rows}
              <View style={styles.noTrainingPhone}>
                <Text style={styles.noTrainingText}>{CONSENT_NO_TRAINING}</Text>
              </View>
            </ScrollView>
            <View style={styles.phoneButtons}>
              {allow}
              {notNow}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    fill: { flex: 1 },
    center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 440, padding: 32, borderRadius: 20, backgroundColor: c.card, gap: 14, shadowColor: c.shadow, shadowOpacity: 0.1, shadowRadius: 30, shadowOffset: { width: 0, height: 10 } },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    brandText: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    title: { fontSize: Typography.size.xl, fontWeight: Typography.weight.bold, color: c.text.primary },
    intro: { fontSize: Typography.size.base, color: c.text.secondary, lineHeight: 21 },
    rows: { gap: 10 },
    rowWide: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 12, backgroundColor: c.cardMuted },
    number: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentLight },
    numberText: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: c.accentDark },
    rowPhone: { padding: 16, borderRadius: 16, backgroundColor: c.card },
    rowText: { flex: 1, fontSize: Typography.size.base, color: c.text.primary, lineHeight: 22 },
    bold: { fontWeight: Typography.weight.bold },
    noTraining: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: c.status.success.bg },
    noTrainingPhone: { padding: 16, borderRadius: 16, backgroundColor: c.status.success.bg },
    tick: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    noTrainingText: { flex: 1, fontSize: Typography.size.sm, color: c.status.success.text, lineHeight: 20 },
    agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    agree: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    agreeText: { flex: 1, fontSize: Typography.size.sm, color: c.text.primary, lineHeight: 20 },
    link: { fontSize: Typography.size.sm, color: c.accentDark, textDecorationLine: 'underline' },
    allow: { height: 48, borderRadius: 12, backgroundColor: c.button.primary, alignItems: 'center', justifyContent: 'center' },
    allowOff: { backgroundColor: c.button.disabled },
    allowText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    allowTextOff: { color: c.button.disabledText },
    notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    notNowText: { fontSize: Typography.size.base, color: c.text.secondary },
    pressed: { opacity: 0.75 },
    phone: { flex: 1, paddingHorizontal: 20 },
    phoneBody: { gap: 14 },
    phoneTitle: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.extrabold, color: c.text.onGradientStrong },
    phoneIntro: { fontSize: Typography.size.base, color: c.text.onGradient, lineHeight: 21 },
    phoneButtons: { gap: 8, paddingTop: 12 },
  });
