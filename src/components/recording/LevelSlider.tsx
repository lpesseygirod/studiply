import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { levelAfterKey, levelAt } from '../../utils/markHints';

/**
 * A 1–10 slider (the mark panel; docs/design desktop-01 and
 * iphone-03): a thin track filled in the accent up to a round accent thumb.
 * Drag the thumb or tap a place on the track; ten stops. VoiceOver adjusts it
 * one step at a time; on the laptop it takes the arrow keys, Home and End.
 * The words at its ends are the panel's (above it on the laptop, under it on
 * the iPhone).
 */
export function LevelSlider({
  value,
  onChange,
  label,
  thumb = 18,
}: {
  value: number;
  onChange: (level: number) => void;
  /** What it sets (the mark's question). */
  label: string;
  /** The thumb's size (the iPhone's is a little larger, for a finger). */
  thumb?: number;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
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
    <View
      style={[styles.touch, { marginHorizontal: thumb / 2 }]}
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
        <View style={[styles.fill, { width: at }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: at - thumb / 2, width: thumb, height: thumb, borderRadius: thumb / 2, borderColor: c.card }]}
      />
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // 36 high to touch (44 with the panel's own room around it); the thumb's half stays inside at both ends.
    touch: { height: 36, justifyContent: 'center' },
    track: { height: 6, borderRadius: 3, backgroundColor: c.track, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3, backgroundColor: c.accent },
    thumb: {
      position: 'absolute',
      backgroundColor: c.accent,
      borderWidth: 2,
      shadowColor: c.black,
      shadowOpacity: 0.2,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
  });
