import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { useRecorderState } from '../../hooks/useRecorder';
import type { AssistantChat as Chat } from '../../hooks/useAssistant';
import { AssistantChat, knownText } from './AssistantChat';

/** The sheet's height when it opens, as iphone-04 (the recording header stays in sight above it). */
const OPEN_SHARE = 0.66;
/** How far (px) the handle must be dragged to go up to full height, down a step, or closed. */
const STEP = 60;

/**
 * The study assistant on the iPhone (and the web below 1024 px): a sheet
 * over the document screen with a handle (docs/design iphone-04, step 6.2).
 * Dragging the handle up gives it the full height, down lowers it again or
 * closes it; a tap above it closes it. "Study assistant", the "Recording
 * continues" pill while this lecture records (it never stops the recording),
 * "Knows this lecture up to mm:ss", then the conversation (AssistantChat).
 * The conversation lives in the document screen (useAssistant), so closing
 * the sheet keeps it, and an answer still streaming goes on.
 */
export function AssistantSheet({ visible, onClose, chat, onTime }: { visible: boolean; onClose: () => void; chat: Chat; onTime: (ms: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const live = useRecorderState();
  const paused = live.status === 'paused';
  const open = Math.round(height * OPEN_SHARE);
  const full = height - insets.top - 8;
  const [expanded, setExpanded] = useState(false);
  const h = useRef(new Animated.Value(open)).current;
  const state = useRef({ expanded, open, full, onClose });
  state.current = { expanded, open, full, onClose };

  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);
  useEffect(() => {
    Animated.spring(h, { toValue: expanded ? full : open, useNativeDriver: false, bounciness: 2 }).start();
  }, [expanded, open, full, h]);

  /** A drag of the handle let go: `dy` px down (negative: up). */
  const release = (dy: number) => {
    const s = state.current;
    if (dy < -STEP) setExpanded(true);
    else if (dy > STEP && s.expanded) setExpanded(false);
    else if (dy > STEP) s.onClose();
    else Animated.spring(h, { toValue: s.expanded ? s.full : s.open, useNativeDriver: false, bounciness: 2 }).start();
  };
  const move = (dy: number) => {
    const s = state.current;
    h.setValue(Math.min(s.full, Math.max(120, (s.expanded ? s.full : s.open) - dy)));
  };
  const handlers = useRef({ release, move });
  handlers.current = { release, move };

  // The iPhone: a finger on the handle's strip.
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_e, g) => handlers.current.move(g.dy),
        onPanResponderRelease: (_e, g) => handlers.current.release(g.dy),
        onPanResponderTerminate: () => handlers.current.release(0),
      }),
    [],
  );
  // The web below 1024 px: a mouse (or finger) dragging the handle's strip.
  const dragHandle = (e: { nativeEvent: { clientY: number }; preventDefault?: () => void }) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault?.();
    const startY = e.nativeEvent.clientY;
    const onMove = (ev: PointerEvent) => handlers.current.move(ev.clientY - startY);
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      handlers.current.release(ev.clientY - startY);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the study assistant" />
        <Animated.View style={[styles.sheet, { height: h, paddingBottom: insets.bottom + 10 }]} {...{ dataSet: { assistant: 'sheet', expanded: String(expanded) } }}>
          <View
            style={styles.handleZone}
            onPointerDown={dragHandle}
            {...(Platform.OS === 'web' ? {} : responder.panHandlers)}
            accessibilityRole="adjustable"
            accessibilityLabel={expanded ? 'Lower the study assistant' : 'Raise the study assistant'}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => setExpanded(e.nativeEvent.actionName === 'increment')}
            {...{ dataSet: { sheet: 'handle' } }}
          >
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Study assistant</Text>
              {live.lectureId === chat.lectureId && live.status !== 'idle' && (
                <View style={styles.recording} {...{ dataSet: { recording: 'continues' } }}>
                  <View style={[styles.recordingDot, paused && styles.recordingDotPaused]} />
                  <Text style={styles.recordingText}>{paused ? 'Paused' : 'Recording continues'}</Text>
                </View>
              )}
            </View>
            <Text style={styles.known} {...{ dataSet: { assistant: 'known' } }}>
              {knownText(chat.knownUpToMs)}
            </Text>
          </View>
          <AssistantChat chat={chat} layout="sheet" onTime={onTime} />
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
      shadowColor: c.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -2 },
      elevation: 12,
      overflow: 'hidden',
    },
    // The handle's strip: wide enough to grab with a mouse (the web); never selects text.
    handleZone: { height: 22, alignItems: 'center', justifyContent: 'center', userSelect: 'none', cursor: 'grab' } as object,
    handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: c.border },
    header: { paddingHorizontal: 18, paddingBottom: 12, gap: 4, borderBottomWidth: 1, borderBottomColor: c.surfaceMuted },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    title: { fontSize: Typography.size.md + 1, fontWeight: Typography.weight.bold, color: c.text.primary },
    known: { fontSize: Typography.size.sm, color: c.text.secondary },
    recording: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: c.recordingStrip.bg },
    recordingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.recordingStrip.dot },
    recordingDotPaused: { backgroundColor: 'transparent', borderWidth: 2, borderColor: c.recordingStrip.dot },
    recordingText: { fontSize: Typography.size.xs + 1, fontWeight: Typography.weight.semibold, color: c.recordingStrip.text },
  });
