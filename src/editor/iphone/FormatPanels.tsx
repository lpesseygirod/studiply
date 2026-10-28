import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { CustomKeyboardExtension, useBridgeState, type CustomKeyboardComponentProps, type EditorBridge } from '@10play/tentap-editor';

import type { ThemeColors } from '../../constants/colors';
import { ColorGrid } from '../../components/editor/ColorGrid';
import { SpectrumPicker } from '../../components/editor/SpectrumPicker';
import { useRecentColours } from '../../services/preferences.service';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { FormatBridgeInstance, FormatBridgeState } from '../bridges/format';
import { ALIGNS, TEXT_STYLES, type Align, type FormatCommand, type TextStyleKey } from '../format';
import { LINE_SPACINGS } from '../schema/blocks';
import { FONTS } from '../schema/fonts';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Bridge = EditorBridge & FormatBridgeInstance;

const ALIGN_ICON: Record<Align, IconName> = {
  left: 'format-align-left',
  center: 'format-align-center',
  right: 'format-align-right',
  justify: 'format-align-justify',
};
const SPACING_LABEL: Record<number, string> = { 1: 'Single', 1.15: '1.15', 1.5: '1.5', 2: 'Double' };
const STYLE_LOOK: Record<TextStyleKey, object> = {
  title: { fontSize: 24, fontWeight: Typography.weight.bold },
  h1: { fontSize: 21, fontWeight: Typography.weight.bold },
  h2: { fontSize: 18, fontWeight: Typography.weight.bold },
  subheading: { fontSize: 16, fontWeight: Typography.weight.semibold },
  normal: { fontSize: 15 },
  quote: { fontSize: 15, fontStyle: 'italic' },
};

/** The panel's top line: its name and the keyboard button (back to typing). */
function PanelHeader({ title, close }: { title: string; close: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable onPress={close} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Show the keyboard">
        <MaterialCommunityIcons name="keyboard-outline" size={24} color={c.accentDark} />
      </Pressable>
    </View>
  );
}

/**
 * Aa (step 4.4, DESIGN: the iPhone's styles and size), in place of the
 * keyboard as in Google Docs: the selection stays where it is. Styles in
 * their own look · align (left, centre, right, justify, labelled) · font ·
 * − size + · line spacing · indent − + ·
 * Page break · Clear formatting · Paste without formatting.
 */
function AaPanel({ editor, close }: Partial<CustomKeyboardComponentProps>) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const bridge = editor as Bridge;
  const s = (useBridgeState(bridge) as ReturnType<typeof useBridgeState> & Partial<FormatBridgeState>).format;
  const run = (cmd: FormatCommand) => bridge.format(cmd);

  const pastePlain = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (text) run({ type: 'insertText', text });
    close?.();
  };

  const chip = (key: string, label: string, onPress: () => void, active: boolean, textStyle?: object) => (
    <Pressable key={key} onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && styles.chipTextActive, textStyle]}>{label}</Text>
    </Pressable>
  );
  const icon = (label: string, name: IconName, onPress: () => void, { active = false, disabled = false } = {}) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={disabled}
      style={[styles.iconButton, styles.iconBox, active && styles.chipActive, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
    >
      <MaterialCommunityIcons name={name} size={22} color={active ? c.accentDark : c.text.primary} />
    </Pressable>
  );

  return (
    <View style={styles.panel}>
      <PanelHeader title="Format" close={() => close?.()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <View style={styles.card}>
          {TEXT_STYLES.map((t, i) => (
            <Pressable
              key={t.key}
              onPress={() => run({ type: 'style', style: t.key })}
              style={[styles.styleRow, i > 0 && styles.divider]}
              accessibilityRole="button"
              accessibilityState={{ selected: s?.style === t.key }}
            >
              <Text style={[styles.styleText, STYLE_LOOK[t.key]]}>{t.label}</Text>
              {s?.style === t.key && <MaterialCommunityIcons name="check" size={20} color={c.accentDark} />}
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Align</Text>
        <View style={styles.alignRow}>
          {ALIGNS.map((a) => {
            const active = s?.align === a.key;
            return (
              <Pressable
                key={a.key}
                onPress={() => run({ type: 'align', align: a.key })}
                style={[styles.alignButton, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Align ${a.label.toLowerCase()}`}
                accessibilityState={{ selected: active }}
              >
                <MaterialCommunityIcons name={ALIGN_ICON[a.key]} size={22} color={active ? c.accentDark : c.text.primary} />
                <Text style={[styles.alignText, active && styles.chipTextActive]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Font</Text>
        <View style={styles.row}>{FONTS.map((f) => chip(f.key, f.label, () => run({ type: 'font', font: f.key }), s?.font === f.key))}</View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Size</Text>
          <View style={styles.row}>
            {icon('Smaller', 'minus', () => run({ type: 'sizeStep', direction: -1 }))}
            <Text style={styles.size} accessibilityLabel={`Size ${s?.size ?? ''}`}>{s?.size ?? '–'}</Text>
            {icon('Bigger', 'plus', () => run({ type: 'sizeStep', direction: 1 }))}
          </View>
        </View>

        <Text style={styles.label}>Line spacing</Text>
        <View style={styles.row}>{LINE_SPACINGS.map((v) => chip(String(v), SPACING_LABEL[v], () => run({ type: 'lineSpacing', spacing: v }), s?.lineSpacing === v))}</View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Indent</Text>
          <View style={styles.row}>
            {icon('Decrease indent', 'format-indent-decrease', () => run({ type: 'outdent' }), { disabled: s ? !s.canOutdent : false })}
            {icon('Increase indent', 'format-indent-increase', () => run({ type: 'indent' }), { disabled: s ? !s.canIndent : false })}
          </View>
        </View>

        <View style={styles.card}>
          {[
            { label: 'Page break', icon: 'format-page-break' as IconName, onPress: () => run({ type: 'pageBreak' }) },
            { label: 'Clear formatting', icon: 'format-clear' as IconName, onPress: () => run({ type: 'clear' }) },
            { label: 'Paste without formatting', icon: 'content-paste' as IconName, onPress: pastePlain },
          ].map((a, i) => (
            <Pressable key={a.label} onPress={a.onPress} style={[styles.actionRow, i > 0 && styles.divider]} accessibilityRole="button">
              <MaterialCommunityIcons name={a.icon} size={20} color={c.text.primary} />
              <Text style={styles.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Text colour and highlight, in place of the keyboard (step 4.5): the same
 * picker as the laptop's: Automatic / None, the 10 colours with their
 * shades, Recent colours (synced with the laptop), More colours… (the
 * spectrum, here in the panel).
 */
function ColorPanel({ editor, close }: Partial<CustomKeyboardComponentProps>) {
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const bridge = editor as Bridge;
  const s = (useBridgeState(bridge) as ReturnType<typeof useBridgeState> & Partial<FormatBridgeState>).format;
  const run = (cmd: FormatCommand) => bridge.format(cmd);
  const recent = useRecentColours();
  const [kind, setKind] = useState<'color' | 'highlight'>('color');
  const [spectrum, setSpectrum] = useState(false);
  const current = kind === 'color' ? (s?.color ?? null) : s?.highlight && s.highlight !== 'default' ? s.highlight : null;
  // Ten columns across the panel.
  const size = Math.floor((width - 24 - 9 * 6) / 10);

  const pick = (colour: string | null) => {
    if (colour) recent.add(colour);
    setSpectrum(false);
    run(kind === 'color' ? { type: 'color', color: colour } : { type: 'highlight', color: colour });
  };

  return (
    <View style={styles.panel}>
      <PanelHeader title="Colour" close={() => close?.()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <View style={styles.row}>
          {(['color', 'highlight'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                setKind(k);
                setSpectrum(false);
              }}
              style={[styles.chip, styles.tab, kind === k && styles.chipActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: kind === k }}
            >
              <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>{k === 'color' ? 'Text colour' : 'Highlight'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.card}>
          <View style={styles.pickerBox}>
            {spectrum ? (
              <SpectrumPicker initial={current} showHex={false} onDone={pick} onCancel={() => setSpectrum(false)} width={width - 48} />
            ) : (
              <ColorGrid
                value={current}
                noneLabel={kind === 'color' ? 'Automatic' : 'None'}
                recent={recent.recent}
                onPick={pick}
                onMore={() => setSpectrum(true)}
                size={size}
                kind={kind === 'color' ? 'Text colour' : 'Highlight'}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export const AA_PANEL = 'studiply-aa';
export const COLOR_PANEL = 'studiply-colors';
export const AaKeyboard = new CustomKeyboardExtension(AA_PANEL, AaPanel);
export const ColorKeyboard = new CustomKeyboardExtension(COLOR_PANEL, ColorPanel);

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    panel: { flex: 1, backgroundColor: c.cardMuted },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 4, height: 48 },
    title: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    content: { paddingHorizontal: 12, paddingBottom: 24, gap: 8 },
    card: { borderRadius: 12, backgroundColor: c.card, overflow: 'hidden' },
    styleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 14 },
    styleText: { color: c.text.primary },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    label: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.secondary, marginTop: 6 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', backgroundColor: c.card },
    chipActive: { backgroundColor: c.accentLight },
    chipText: { fontSize: Typography.size.base, color: c.text.primary },
    chipTextActive: { color: c.accentDark, fontWeight: Typography.weight.semibold },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    iconBox: { backgroundColor: c.card },
    disabled: { opacity: 0.35 },
    size: { minWidth: 40, textAlign: 'center', fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14 },
    actionText: { fontSize: Typography.size.base, color: c.text.primary },
    alignRow: { flexDirection: 'row', gap: 8 },
    alignButton: { flex: 1, minHeight: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: c.card },
    alignText: { fontSize: Typography.size.xs, color: c.text.primary },
    pickerBox: { padding: 12 },
    tab: { flex: 1, alignItems: 'center' },
  });
