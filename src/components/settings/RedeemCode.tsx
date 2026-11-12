/**
 * RedeemCode.tsx
 * Settings → Credits, "Have a code?" (part A; Lea 12 Nov; no mockup: Settings' card and row). On the web
 * only, at any width: App Store rule 3.1.1 lets the iPhone app unlock nothing with its own codes, so the
 * iPhone shows nothing about codes at all. The server alone checks a code (redeem_code).
 */

import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useConnectivity } from '../../lib/connectivity';
import { REDEEM_OFFLINE } from '../../lib/credits/codes';
import { redeemCode } from '../../services/codes.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { makeSettingsStyles } from './styles';

export function RedeemCode() {
  const settingsStyles = useThemedStyles(makeSettingsStyles);
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const offline = useConnectivity() === 'offline';
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ text: string; ok: boolean } | null>(null);
  if (Platform.OS !== 'web') return null;

  const canRedeem = !busy && !offline && code.trim().length > 0;
  const redeem = async () => {
    if (!canRedeem) return;
    setBusy(true);
    setAnswer(null);
    const result = await redeemCode(code);
    setAnswer(result);
    if (result.ok) setCode('');
    setBusy(false);
  };

  return (
    <View style={settingsStyles.card} {...{ dataSet: { credits: 'code-card' } }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.row}
        accessibilityRole="button"
        {...a11yState({ expanded: open })}
        {...{ dataSet: { credits: 'code-open' } }}
      >
        <Text style={settingsStyles.rowLabel}>Have a code?</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.text.secondary} />
      </Pressable>
      {open && (
        <View style={styles.body}>
          <View style={styles.inputRow}>
            <TextInput
              value={code}
              onChangeText={(t) => {
                setCode(t);
                setAnswer(null);
              }}
              onSubmitEditing={() => void redeem()}
              placeholder="Code"
              placeholderTextColor={c.text.placeholder}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Code"
              style={styles.input}
              {...{ dataSet: { credits: 'code-input' } }}
            />
            <Pressable
              onPress={() => void redeem()}
              disabled={!canRedeem}
              aria-disabled={!canRedeem}
              style={({ pressed }) => [styles.button, !canRedeem && styles.buttonOff, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canRedeem }}
              {...{ dataSet: { credits: 'code-redeem' } }}
            >
              {busy ? <ActivityIndicator color={c.button.primaryText} /> : <Text style={[styles.buttonText, !canRedeem && styles.buttonTextOff]}>Redeem</Text>}
            </Pressable>
          </View>
          {(offline || answer) && (
            <Text
              style={[styles.answer, answer?.ok && !offline && styles.answerOk]}
              accessibilityLiveRegion="polite"
              {...{ dataSet: { credits: 'code-answer' } }}
            >
              {offline ? REDEEM_OFFLINE : answer?.text}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 48 },
    body: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
    inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    input: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      fontSize: Typography.size.base,
      color: c.text.primary,
      backgroundColor: c.card,
    },
    button: { minHeight: 44, paddingHorizontal: 18, borderRadius: 10, backgroundColor: c.button.primary, alignItems: 'center', justifyContent: 'center' },
    buttonOff: { backgroundColor: c.button.disabled },
    buttonText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    buttonTextOff: { color: c.button.disabledText },
    pressed: { opacity: 0.8 },
    answer: { fontSize: Typography.size.sm, color: c.text.secondary },
    answerOk: { color: c.status.success.text },
  });
