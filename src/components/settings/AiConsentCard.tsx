import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { onAiPausedChange } from '../../lib/consentGate';
import { consentStatus, ConsentDeclinedError, giveConsent, onConsentChanged, withdrawConsent } from '../../services/consent.service';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { errorMessage } from '../../utils/errors';
import { requestAiConsent } from '../consent/consentRequests';
import { CONSENT_SUMMARY_PARTS } from '../consent/consentTexts';
import { showAlert } from '../dialogs/dialogs';
import { SettingSwitch } from './PreferenceSettings';
import { makeSettingsStyles } from './styles';

/** "12 Nov 2026" */
export const allowedDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Her consent, followed live (the card, and the Settings list's "Allowed / Off"). */
export function useAiConsent(): { allowed: boolean | null; since: string | null; reload: () => void } {
  const [state, setState] = useState<{ allowed: boolean | null; since: string | null }>({ allowed: null, since: null });
  const reload = useCallback(() => {
    consentStatus()
      .then(setState)
      .catch(() => setState((s) => s));
  }, []);
  useEffect(() => {
    reload();
    const a = onConsentChanged(reload);
    const b = onAiPausedChange(reload);
    return () => {
      a();
      b();
    };
  }, [reload]);
  return { ...state, reload };
}

/**
 * Settings → AI & privacy's first card (step 10.1, iphone-08): "Use AI on my lectures" with its
 * switch, where the data goes, and the date it was allowed. Off is one tap, as easy as on (GDPR):
 * nothing is sent to an AI service from then on, on this device at once and everywhere once it
 * reaches the server. On shows the consent screen first (it needs a connection).
 */
export function AiConsentCard() {
  const settingsStyles = useThemedStyles(makeSettingsStyles);
  const styles = useThemedStyles(makeStyles);
  const { allowed, since } = useAiConsent();
  const [busy, setBusy] = useState(false);

  const change = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        if (!(await requestAiConsent('ai'))) throw new ConsentDeclinedError('assistant_summary');
        await giveConsent();
      } else {
        await withdrawConsent();
      }
    } catch (err) {
      if (!(err instanceof ConsentDeclinedError)) showAlert('That didn’t work', errorMessage(err, 'Turning AI on needs a connection.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={settingsStyles.card} {...{ dataSet: { aiConsent: allowed === null ? 'loading' : allowed ? 'on' : 'off' } }}>
      <View style={styles.inner}>
        <View style={styles.head}>
          <Text style={styles.title}>Use AI on my lectures</Text>
          {allowed === null || busy ? (
            <ActivityIndicator size="small" />
          ) : (
            <SettingSwitch value={allowed} onValueChange={(v) => void change(v)} accessibilityLabel="Use AI on my lectures" />
          )}
        </View>
        <Text style={styles.body}>
          {CONSENT_SUMMARY_PARTS.map((p, i) => (
            <Text key={i} style={p.bold ? styles.bold : undefined}>
              {p.text}
            </Text>
          ))}
        </Text>
        <Text style={styles.since} {...{ dataSet: { aiConsentSince: since ?? '' } }}>
          {allowed ? (since ? `Allowed on ${allowedDate(since)}` : 'Allowed') : allowed === false ? 'Off · nothing is sent to AI services' : ' '}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    inner: { padding: 16, gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32 },
    title: { flex: 1, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    body: { fontSize: Typography.size.base, color: c.text.primary, lineHeight: 22 },
    bold: { fontWeight: Typography.weight.bold },
    since: { fontSize: Typography.size.sm, color: c.text.secondary },
  });
