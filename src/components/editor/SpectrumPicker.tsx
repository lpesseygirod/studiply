import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { cleanHex, hexToHsv, hsvToHex, type HSV } from '../../editor/colors/palette';
import { useThemedStyles } from '../../theme/ThemeProvider';

const HUE_STOPS = [0, 60, 120, 180, 240, 300, 360].map((h) => hsvToHex({ h: h % 360, s: 1, v: 1 }));
const WHITE = hsvToHex({ h: 0, s: 0, v: 1 });
const BLACK = hsvToHex({ h: 0, s: 0, v: 0 });

/**
 * "More colours…" (step 4.5, as Word's): any colour from a full spectrum. A
 * square for saturation (left to right) and brightness (top to bottom), a
 * strip for the hue, the new colour beside the current one, and on the
 * laptop a hex field. Drawn with gradients and touches, so the same on the
 * iPhone and the web.
 */
export function SpectrumPicker({
  initial,
  showHex,
  onDone,
  onCancel,
  width = 240,
}: {
  initial: string | null;
  showHex: boolean;
  onDone: (colour: string) => void;
  onCancel: () => void;
  width?: number;
}) {
  const styles = useThemedStyles(makeStyles);
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(initial ?? hsvToHex({ h: 230, s: 0.7, v: 0.8 })));
  const colour = hsvToHex(hsv);
  const [hex, setHex] = useState(colour);
  const [box, setBox] = useState({ w: width, h: Math.round(width * 0.66) });
  const [strip, setStrip] = useState(width);
  const hueColour = useMemo(() => hsvToHex({ h: hsv.h, s: 1, v: 1 }), [hsv.h]);

  const set = (next: HSV) => {
    setHsv(next);
    setHex(hsvToHex(next));
  };
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const onSquare = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    set({ h: hsv.h, s: clamp(locationX / box.w), v: clamp(1 - locationY / box.h) });
  };
  const onHue = (e: GestureResponderEvent) => set({ ...hsv, h: clamp(e.nativeEvent.locationX / strip) * 359.9 });
  const touch = (handler: (e: GestureResponderEvent) => void) => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: handler,
    onResponderMove: handler,
    onResponderTerminationRequest: () => false,
  });

  return (
    <View style={[styles.wrap, { width }]}>
      <View
        style={[styles.square, { height: box.h, backgroundColor: hueColour }]}
        onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        accessibilityLabel="Saturation and brightness"
        {...touch(onSquare)}
      >
        <LinearGradient colors={[WHITE, `${WHITE}00`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <LinearGradient colors={[`${BLACK}00`, BLACK]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View pointerEvents="none" style={[styles.knob, { left: hsv.s * box.w - 8, top: (1 - hsv.v) * box.h - 8, backgroundColor: colour }]} />
      </View>
      <View style={styles.hue} onLayout={(e) => setStrip(e.nativeEvent.layout.width)} accessibilityLabel="Hue" {...touch(onHue)}>
        <LinearGradient colors={HUE_STOPS as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View pointerEvents="none" style={[styles.hueKnob, { left: (hsv.h / 360) * strip - 4 }]} />
      </View>
      <View style={styles.row}>
        <View style={styles.preview}>
          <View style={[styles.previewHalf, { backgroundColor: initial ?? WHITE }]} accessibilityLabel="Current colour" />
          <View style={[styles.previewHalf, { backgroundColor: colour }]} accessibilityLabel="New colour" />
        </View>
        {showHex ? (
          <TextInput
            value={hex}
            onChangeText={setHex}
            onBlur={() => {
              const clean = cleanHex(hex);
              if (clean) set(hexToHsv(clean));
              else setHex(colour);
            }}
            onSubmitEditing={() => {
              const clean = cleanHex(hex);
              if (clean) onDone(clean);
            }}
            autoCapitalize="characters"
            maxLength={7}
            style={styles.hex}
            accessibilityLabel="Hex colour"
          />
        ) : (
          <Text style={styles.hexText}>{colour}</Text>
        )}
      </View>
      <View style={styles.row}>
        <Pressable onPress={onCancel} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={() => onDone(cleanHex(hex) ?? colour)} style={styles.primary} accessibilityRole="button" accessibilityLabel="Use this colour">
          <Text style={styles.primaryText}>OK</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    square: { borderRadius: 8, overflow: 'hidden' },
    knob: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: c.white },
    hue: { height: 18, borderRadius: 9, overflow: 'hidden' },
    hueKnob: { position: 'absolute', top: 1, width: 8, height: 16, borderRadius: 3, borderWidth: 2, borderColor: c.white },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    preview: { flexDirection: 'row', width: 64, height: 28, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    previewHalf: { flex: 1 },
    hex: {
      flex: 1,
      minWidth: 0,
      width: 0,
      height: 32,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: Typography.size.base,
      color: c.text.primary,
      fontVariant: ['tabular-nums'],
      outlineStyle: 'none' as never,
    },
    hexText: { flex: 1, fontSize: Typography.size.base, color: c.text.secondary, fontVariant: ['tabular-nums'] },
    secondary: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    secondaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    primary: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
  });
