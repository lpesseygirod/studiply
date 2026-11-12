/**
 * AdminCodes.tsx
 * The dashboard's Codes (docs/reports/plan-10.2-codes-admin.md, part A; no mockup: Settings' cards and
 * rows). New code (the code or Suggest, lectures in quarters, total uses, optional expiry, a note) and
 * the list ("4 of 50 used · 10 lectures · No expiry", Active / Off, Turn off / Turn on). No delete: the
 * ledger's rows refer to a code. The server checks everything again (admin_create_code).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { makeSettingsStyles } from '../settings/styles';
import { codeRowLine, expiresAt, newCodeProblem, normalizeCode, suggestCode } from '../../lib/credits/codes';
import { adminCodes, adminCreateCode, adminSetCodeActive, type AdminCode } from '../../services/codes.service';
import { errorMessage } from '../../utils/errors';

export function AdminCodes() {
  const settingsStyles = useThemedStyles(makeSettingsStyles);
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [codes, setCodes] = useState<AdminCode[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', lectures: '10', uses: '50', expires: '', note: '' });
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCodes(await adminCodes());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load the codes.'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const fields = { code: form.code, lectures: Number(form.lectures.replace(',', '.')), uses: Number(form.uses), expires: form.expires };
  const problem = newCodeProblem(fields);
  const create = async () => {
    if (problem || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminCreateCode({
        code: fields.code,
        units: Math.round(fields.lectures * 4),
        uses: fields.uses,
        expiresAt: form.expires.trim() ? expiresAt(form.expires) : null,
        note: form.note,
      });
      if (result === 'taken') {
        setMessage({ text: `${normalizeCode(fields.code)} exists already.`, ok: false });
      } else {
        setMessage({ text: `${normalizeCode(fields.code)} is ready.`, ok: true });
        setForm((f) => ({ ...f, code: '', note: '' }));
        await load();
      }
    } catch (err) {
      setMessage({ text: errorMessage(err, 'Could not make the code.'), ok: false });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (code: AdminCode) => {
    try {
      await adminSetCodeActive(code.id, !code.active);
      await load();
    } catch (err) {
      setMessage({ text: errorMessage(err, 'Could not change the code.'), ok: false });
    }
  };

  const field = (key: keyof typeof form, label: string, placeholder: string, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={form[key]}
        onChangeText={(t) => {
          setForm((f) => ({ ...f, [key]: t }));
          setMessage(null);
        }}
        placeholder={placeholder}
        placeholderTextColor={c.text.placeholder}
        accessibilityLabel={label}
        autoCorrect={false}
        style={styles.input}
        {...{ dataSet: { admin: `code-${key}` } }}
        {...extra}
      />
    </View>
  );

  return (
    <>
      <Text style={settingsStyles.sectionHeader} accessibilityRole="header">
        NEW CODE
      </Text>
      <View style={[settingsStyles.card, styles.form]} {...{ dataSet: { admin: 'new-code' } }}>
        <View style={styles.formRow}>
          {field('code', 'Code', 'STUDY10', { autoCapitalize: 'characters' })}
          <Pressable
            onPress={() => setForm((f) => ({ ...f, code: suggestCode() }))}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            accessibilityRole="button"
            {...{ dataSet: { admin: 'code-suggest' } }}
          >
            <Text style={styles.secondaryText}>Suggest</Text>
          </Pressable>
        </View>
        <View style={styles.formRow}>
          {field('lectures', 'Lectures', '10', { keyboardType: 'decimal-pad' })}
          {field('uses', 'Total uses', '50', { keyboardType: 'number-pad' })}
          {field('expires', 'Expires (optional)', 'YYYY-MM-DD')}
        </View>
        {field('note', 'Note (only you see it)', 'For the beta group')}
        <View style={styles.formRow}>
          <Text style={[styles.small, styles.grow, message && (message.ok ? styles.ok : styles.bad)]} accessibilityLiveRegion="polite" {...{ dataSet: { admin: 'code-message' } }}>
            {message?.text ?? (form.code.trim() ? (problem ?? '') : 'Each account can use a code once.')}
          </Text>
          <Pressable
            onPress={() => void create()}
            disabled={!!problem || busy}
            aria-disabled={!!problem || busy}
            style={({ pressed }) => [styles.primary, (!!problem || busy) && styles.primaryOff, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!problem || busy }}
            {...{ dataSet: { admin: 'code-create' } }}
          >
            {busy ? <ActivityIndicator color={c.button.primaryText} /> : <Text style={[styles.primaryText, (!!problem || busy) && styles.primaryTextOff]}>Make code</Text>}
          </Pressable>
        </View>
      </View>

      <Text style={settingsStyles.sectionHeader} accessibilityRole="header">
        CODES
      </Text>
      <View style={settingsStyles.card} {...{ dataSet: { admin: 'codes' } }}>
        {loadError ? (
          <Text style={[styles.small, styles.pad]}>{loadError}</Text>
        ) : !codes ? (
          <ActivityIndicator style={styles.pad} color={c.accent} />
        ) : codes.length === 0 ? (
          <Text style={[styles.small, styles.pad]}>No codes yet.</Text>
        ) : (
          codes.map((code, i) => (
            <React.Fragment key={code.id}>
              {i > 0 && <View style={settingsStyles.divider} />}
              <View style={styles.row} {...{ dataSet: { admin: 'code-row', code: code.code, active: String(code.active) } }}>
                <View style={styles.grow}>
                  <Text style={[styles.code, !code.active && styles.off]}>{code.code}</Text>
                  <Text style={styles.small}>
                    {codeRowLine(code)}
                    {code.note ? ` · ${code.note}` : ''}
                  </Text>
                </View>
                <Text style={[styles.state, code.active ? styles.ok : styles.off]}>{code.active ? 'Active' : 'Off'}</Text>
                <Pressable
                  onPress={() => void toggle(code)}
                  style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${code.active ? 'Turn off' : 'Turn on'} ${code.code}`}
                  {...{ dataSet: { admin: 'code-toggle' } }}
                >
                  <Text style={styles.secondaryText}>{code.active ? 'Turn off' : 'Turn on'}</Text>
                </Pressable>
              </View>
            </React.Fragment>
          ))
        )}
      </View>
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    form: { padding: 16, gap: 12 },
    formRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
    field: { flex: 1, gap: 4 },
    fieldLabel: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary },
    input: {
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      fontSize: Typography.size.base,
      color: c.text.primary,
      backgroundColor: c.card,
    },
    grow: { flex: 1 },
    pad: { padding: 16 },
    small: { fontSize: Typography.size.sm, color: c.text.secondary },
    ok: { color: c.status.success.text },
    bad: { color: c.status.error.text },
    off: { color: c.text.secondary },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    code: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: c.text.primary, letterSpacing: 0.5 },
    state: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
    primary: { minHeight: 44, paddingHorizontal: 18, borderRadius: 10, backgroundColor: c.button.primary, alignItems: 'center', justifyContent: 'center' },
    primaryOff: { backgroundColor: c.button.disabled },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    primaryTextOff: { color: c.button.disabledText },
    secondary: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    pressed: { opacity: 0.8 },
  });
