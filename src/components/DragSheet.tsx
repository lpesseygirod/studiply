import React, { useMemo, useRef } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../constants/colors';
import { useThemedStyles } from '../theme/ThemeProvider';

/** How far down (px) or how fast a drag must go to close the sheet. */
const CLOSE_DISTANCE = 90;
const CLOSE_SPEED = 0.9;

/**
 * A small sheet from the bottom with a drag handle (docs/design iphone-03,
 * the mark sheet): closed by dragging it down or tapping above it, so it
 * needs no Cancel. A control inside that drags itself (the mark slider)
 * keeps its drag: it takes the touch first and doesn't give it up.
 */
export function DragSheet({
  visible,
  onClose,
  closeLabel,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** What tapping above the sheet says it does ("Close the mark"). */
  closeLabel: string;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const dy = useRef(new Animated.Value(0)).current;
  const latest = useRef(onClose);
  latest.current = onClose;

  /** A drag let go: far or fast enough down closes the sheet, else it springs back. `vy` in px per ms. */
  const release = (distance: number, vy: number) => {
    if (distance > CLOSE_DISTANCE || vy > CLOSE_SPEED) {
      latest.current();
      // Back in place for the next time it opens (the Modal slides it away).
      setTimeout(() => dy.setValue(0), 300);
    } else {
      Animated.spring(dy, { toValue: 0, useNativeDriver: Platform.OS !== 'web', bounciness: 4 }).start();
    }
  };
  const releaseRef = useRef(release);
  releaseRef.current = release;

  // The iPhone: a finger dragging the sheet anywhere (a drag mostly downwards; taps and sideways drags
  // stay with what's inside).
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => dy.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => releaseRef.current(g.dy, g.vy),
        onPanResponderTerminate: () => Animated.spring(dy, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(),
      }),
    [dy],
  );

  // The web below 1024 px: a mouse (or finger) dragging the handle's strip. A mouse drag on the sheet's
  // body selects its text instead, and doesn't reach the touch responder above.
  const dragHandle = (e: { nativeEvent: { clientY: number }; preventDefault?: () => void }) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault?.();
    const startY = e.nativeEvent.clientY;
    let last = { y: startY, t: Date.now() };
    let speed = 0;
    const move = (ev: PointerEvent) => {
      const now = Date.now();
      if (now > last.t) speed = (ev.clientY - last.y) / (now - last.t);
      last = { y: ev.clientY, t: now };
      dy.setValue(Math.max(0, ev.clientY - startY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      releaseRef.current(ev.clientY - startY, speed);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: dy }] }]}
          {...(Platform.OS === 'web' ? {} : responder.panHandlers)}
          {...{ dataSet: { sheet: 'drag' } }}
        >
          <View style={styles.handleZone} onPointerDown={dragHandle} accessibilityElementsHidden importantForAccessibility="no" {...{ dataSet: { sheet: 'handle' } }}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    fill: { flex: 1 },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      shadowColor: c.black,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -2 },
      elevation: 12,
    },
    // The handle's strip: the sheet's top edge, wide enough to grab with a mouse (the web); never selects text.
    handleZone: { height: 26, marginHorizontal: -20, alignItems: 'center', justifyContent: 'center', userSelect: 'none', cursor: 'pointer', marginBottom: 2 },
    handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: c.border },
  });
