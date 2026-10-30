import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { levelAfterKey, levelAt } from '../../utils/markHints';

const THUMB = 26;

/**
 * A 1–10 slider with labelled ends (step 5.5, the mark panel): drag the
 * thumb or tap a place on the track; ten stops. VoiceOver adjusts it one
 * step at a time; on the laptop it takes the arrow keys, Home and End.
 */
export function LevelSlider({
  value,
  onChange,
  color,
  low,
  high,
  label,
}: {
  value: number;
  onChange: (level: number) => void;
  /** The filled part and the thumb's ring (the mark's colour). */
  color: string;
  /** The ends' words ("Worth noting" … "Key idea"). */
  low: string;
  high: string;
  /** What it sets (the mark's question). */
  label: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const latest = useRef({ width, onChange, value, startX: 0 });
  latest.current = { ...latest.current, width, onChange, value };

  const set = (x: number) => {
    const next = levelAt(x, latest.current.width);
    if (next !== latest.current.value) latest.current.onChange(next);
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A sheet's swipe or the page's scroll doesn't take the drag away.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          latest.current.startX = e.nativeEvent.locationX;
          set(latest.current.startX);
        },
        onPanResponderMove: (_e, g) => set(latest.current.startX + g.dx),
      }),
    // Made once: `set` reads the latest values through the ref.
    [],
  );

  const at = width > 0 ? ((value - 1) / 9) * width : 0;
  const keys = {
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      const next = levelAfterKey(value, e.key);
      if (next === null) return;
      e.preventDefault();
      if (next !== value) onChange(next);
    },
  };

  return (
    <View style={styles.wrap}>
      <View
        style={styles.touch}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
        focusable
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 1, max: 10, now: value, text: `${value} of 10` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = Math.min(10, Math.max(1, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1)));
          if (next !== value) onChange(next);
        }}
        {...keys}
        {...{ dataSet: { mark: 'slider' } }}
      >
        {/* The parts don't take touches: every position is measured on the track itself. */}
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: at, backgroundColor: color }]} />
        </View>
        <View style={styles.stops} pointerEvents="none">
          {Array.from({ length: 10 }, (_, i) => (
            <View key={i} style={[styles.stop, i < value && { backgroundColor: color }]} />
          ))}
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: at - THUMB / 2, borderColor: color }]} />
      </View>
      <View style={styles.ends}>
        <Text style={styles.end} numberOfLines={1}>
          1 · {low}
        </Text>
        <Text style={[styles.end, styles.endRight]} numberOfLines={1}>
          {high} · 10
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 2 },
    // 44 high to touch; the thumb's half stays inside at both ends.
    touch: { height: 44, justifyContent: 'center', marginHorizontal: THUMB / 2 },
    track: { height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden' },
    fill: { height: 6, borderRadius: 3 },
    stops: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -3 },
    stop: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.border },
    thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: c.white, borderWidth: 3 },
    ends: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    end: { flexShrink: 1, fontSize: Typography.size.xs, color: c.text.secondary },
    endRight: { textAlign: 'right' },
  });
