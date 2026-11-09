import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { a11yState } from '../../utils/a11y';
import { LevelSlider } from '../recording/LevelSlider';
import { makePanelStyles } from './panelStyles';

/**
 * The pieces the settings panels share (Stop & summarize, 7.3; New quiz, 9.1b), moved out of
 * SummarizePanel.tsx as they were drawn there. `data` is the element's test attributes (each panel
 * keeps its own: `{ summarize: 'slider-length', value: '5' }`).
 */
type Data = Record<string, string | undefined>;
const dataSet = (data: Data) => ({ dataSet: data });

/** A tick box: on (accent), off, or locked on (greyed: always included). */
export function CheckBox({ on, locked = false }: { on: boolean; locked?: boolean }) {
  const styles = useThemedStyles(makePanelStyles);
  const { colors: c } = useTheme();
  return <View style={[styles.box, on && styles.boxOn, locked && styles.boxLocked]}>{on && <Ionicons name="checkmark" size={14} color={locked ? c.button.disabledText : c.accentOn} />}</View>;
}

/** The laptop's resource card (desktop-02's grid): a tick box, the title and one line under it. */
export function ResourceCard(p: { title: string; detail: string; on: boolean; locked?: boolean; disabled?: boolean; always?: boolean; onPress: () => void; data: Data; hint?: string }) {
  const styles = useThemedStyles(makePanelStyles);
  const off = p.locked || p.disabled;
  return (
    <Pressable
      onPress={p.onPress}
      disabled={off}
      style={({ hovered }: { hovered?: boolean }) => [styles.card, hovered && !off && styles.cardHover]}
      accessibilityRole="checkbox"
      {...a11yState({ checked: p.on, disabled: off })}
      accessibilityLabel={p.title}
      accessibilityHint={p.hint}
      {...dataSet(p.data)}
    >
      <CheckBox on={p.on} locked={p.locked} />
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{p.title}</Text>
        <Text style={[styles.cardDetail, p.always && styles.always]} numberOfLines={1}>
          {p.detail}
        </Text>
      </View>
    </Pressable>
  );
}

/** The iPhone's resource row (iphone-05): the locked green "Always included ✓" row, or a row with ✓ when ticked. */
export function ResourceRow(p: { title: string; on: boolean; locked?: boolean; disabled?: boolean; onPress: () => void; data: Data; label?: string }) {
  const styles = useThemedStyles(makePanelStyles);
  const { colors: c } = useTheme();
  if (p.locked) {
    return (
      <View style={[styles.row, styles.rowNotes]} accessibilityRole="checkbox" {...a11yState({ checked: true, disabled: true })} accessibilityLabel={p.label ?? `${p.title}, always included`} {...dataSet(p.data)}>
        <Text style={styles.rowTitleBold}>{p.title}</Text>
        <Text style={styles.alwaysStrong}>Always included ✓</Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      style={styles.row}
      accessibilityRole="checkbox"
      {...a11yState({ checked: p.on, disabled: p.disabled })}
      accessibilityLabel={p.label ?? p.title}
      {...dataSet(p.data)}
    >
      <Text style={[styles.rowTitle, p.disabled && styles.muted]}>{p.title}</Text>
      {p.on && <Ionicons name="checkmark" size={18} color={c.accentDark} />}
    </Pressable>
  );
}

/** "+ Slides or PDF": a salmon pill; `later` greys it (it says why in `hint`). */
export function AddButton({ label, onPress, later = false, hint, data }: { label: string; onPress: () => void; later?: boolean; hint?: string; data: Data }) {
  const styles = useThemedStyles(makePanelStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.add, later && styles.addLater, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={later ? hint : undefined}
      {...dataSet(data)}
    >
      <Text style={[styles.addText, later && styles.muted]}>+ {label}</Text>
    </Pressable>
  );
}

/** A preset: all alike, as the mockups draw them (no chosen state); it just moves the sliders. */
export function PresetChip({ label, onPress, data }: { label: string; onPress: () => void; data: Data }) {
  const styles = useThemedStyles(makePanelStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Preset: ${label}`} {...dataSet(data)}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

/** "3 · Explanation depth   6/10", the track, and its two ends ("1 · just the facts" on the laptop, "just facts" on the iPhone). */
export function SliderRow(p: { n: number; name: string; low: string; high: string; shortLow: string; shortHigh: string; value: number; onChange: (v: number) => void; wide: boolean; data: Data }) {
  const styles = useThemedStyles(makePanelStyles);
  return (
    <View style={styles.slider} {...dataSet(p.data)}>
      <View style={styles.sliderHead}>
        <Text style={styles.sliderName}>
          {p.n} · {p.name}
        </Text>
        <Text style={styles.sliderValue}>{p.value}/10</Text>
      </View>
      <LevelSlider value={p.value} onChange={p.onChange} label={`${p.name}, from ${p.low} to ${p.high}`} thumb={p.wide ? 18 : 22} />
      <View style={styles.ends}>
        <Text style={styles.end}>{p.wide ? `1 · ${p.low}` : p.shortLow}</Text>
        <Text style={styles.end}>{p.wide ? `10 · ${p.high}` : p.shortHigh}</Text>
      </View>
    </View>
  );
}
