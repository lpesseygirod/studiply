import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { useConnectivity } from '../../lib/connectivity';
import type { AssistantChat as Chat } from '../../hooks/useAssistant';
import { QUICK_PROMPTS, QUICK_PROMPT_ORDER, type ChatTurn } from '../../services/assistant.service';
import { stamp } from '../../../supabase/functions/_shared/assistant';
import { answerPlainText } from '../../utils/answerText';
import { showActionSheet } from '../dialogs/dialogs';
import UserAvatar from '../UserAvatar';
import { AssistantAnswer } from './AssistantAnswer';

/** How long a short notice ("comes in the next step", "Copied") stays. */
const NOTICE_MS = 3000;

export const OFFLINE_NOTE = 'The assistant needs the internet. Your question stays here.';

/** What "Knows this lecture up to" says (both headers). */
export function knownText(knownUpToMs: number | null): string {
  if (knownUpToMs === null) return 'Reading the lecture…';
  return knownUpToMs > 0 ? `Knows this lecture up to ${stamp(knownUpToMs)}` : 'Nothing transcribed yet';
}

/**
 * The study assistant's conversation, quick prompts and composer (step 6.2,
 * DESIGN "Study assistant"), the same on both devices, drawn as each mockup:
 * `panel` the laptop's right panel (desktop-01: an avatar in the question's
 * bubble, "From 24:12 to 34:12", Copy and Retry icons, the composer box with
 * + and "Context: this lecture"), `sheet` the iPhone's sheet (iphone-04:
 * "24:12 → 34:12", Add to notes and Flashcards only, Copy and Retry on a
 * long-press, a rounded composer with a round send button). Add to notes,
 * Flashcards and + say they come next (step 6.3).
 */
export function AssistantChat({ chat, layout, onTime }: { chat: Chat; layout: 'panel' | 'sheet'; onTime: (ms: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c, scheme } = useTheme();
  const offline = useConnectivity() === 'offline';
  const panel = layout === 'panel';
  const scroll = useRef<ScrollView>(null);
  const chipsScroll = useRef<ScrollView>(null);
  // The web draws scrollbars (the chips' row, the conversation) from the CSS color-scheme: dark in dark
  // mode, the browser's own in light mode (as before).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    for (const view of [scroll.current, chipsScroll.current]) {
      const node = (view as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
      if (node) node.style.colorScheme = scheme === 'dark' ? 'dark' : '';
    }
  }, [scheme]);
  const [notice, setNotice] = useState<{ where: string; text: string } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const canAsk = !!chat.lectureId && !chat.busy && !offline;
  const canSend = canAsk && chat.draft.trim().length > 0;
  const send = () => canSend && chat.ask(chat.draft, null);
  const lengthMs = chat.knownUpToMs;

  const copy = async (turn: ChatTurn) => {
    await Clipboard.setStringAsync(answerPlainText(turn.answer)).catch(() => {});
    setNotice({ where: turn.id, text: 'Copied' });
  };
  const comesNext = (turnId: string, what: string) => setNotice({ where: turnId, text: `${what} comes in the next step.` });
  const turnMenu = (turn: ChatTurn) =>
    showActionSheet(undefined, [
      { text: 'Copy', onPress: () => void copy(turn) },
      { text: 'Retry', onPress: () => chat.retry(turn.id) },
    ]);

  const pill = (label: string, onPress: () => void, key: string) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label} {...{ dataSet: { assistant: key } }}>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );

  const turnView = (turn: ChatTurn) => (
    <View key={turn.id} style={styles.turn} {...{ dataSet: { assistant: 'turn', status: turn.status } }}>
      <View style={styles.bubbleRow}>
        <View style={[styles.bubble, panel && styles.bubblePanel]} {...{ dataSet: { assistant: 'bubble' } }}>
          {panel && <UserAvatar size={22} />}
          <Text style={[styles.bubbleText, !panel && styles.bubbleTextSheet]} {...{ dataSet: { assistant: 'question' } }}>
            {turn.question}
          </Text>
        </View>
      </View>
      {turn.window && (
        <Text style={[styles.window, panel && styles.windowPanel]} {...{ dataSet: { assistant: 'window' } }}>
          {panel ? `From ${stamp(turn.window.startMs)} to ${stamp(turn.window.endMs)}` : `${stamp(turn.window.startMs)} → ${stamp(turn.window.endMs)}`}
        </Text>
      )}
      {turn.status === 'error' ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText} {...{ dataSet: { assistant: 'error' } }}>
            {turn.error ?? 'The assistant could not answer.'}
          </Text>
          <Pressable onPress={() => chat.retry(turn.id)} disabled={!canAsk} accessibilityRole="button" accessibilityLabel="Retry" {...{ dataSet: { assistant: 'retry' } }}>
            <Text style={[styles.retryText, !canAsk && styles.off]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onLongPress={!panel && turn.status === 'done' ? () => turnMenu(turn) : undefined}
          delayLongPress={350}
          accessibilityHint={!panel && turn.status === 'done' ? 'Long-press to copy or retry' : undefined}
          style={{ cursor: 'auto' } as object}
        >
          {turn.answer ? (
            <AssistantAnswer text={turn.answer} size={layout} lengthMs={lengthMs} onTime={onTime} />
          ) : (
            <Text style={styles.thinking}>Thinking…</Text>
          )}
        </Pressable>
      )}
      {turn.status === 'done' && (
        <View style={styles.actions}>
          {panel && (
            <>
              <Pressable onPress={() => void copy(turn)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Copy" {...{ dataSet: { assistant: 'copy' } }}>
                <Ionicons name="copy-outline" size={16} color={c.text.secondary} />
              </Pressable>
              <Pressable onPress={() => chat.retry(turn.id)} disabled={!canAsk} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Retry" {...{ dataSet: { assistant: 'retry' } }}>
                <Ionicons name="refresh" size={17} color={c.text.secondary} />
              </Pressable>
            </>
          )}
          {pill('Add to notes', () => comesNext(turn.id, 'Add to notes'), 'add-to-notes')}
          {pill('Flashcards', () => comesNext(turn.id, 'Flashcards'), 'flashcards')}
        </View>
      )}
      {notice?.where === turn.id && (
        <Text style={styles.notice} {...{ dataSet: { assistant: 'notice' } }}>
          {notice.text}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.fill}>
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={[styles.conversation, !panel && styles.conversationSheet]}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        {...{ dataSet: { assistant: 'conversation' } }}
      >
        {chat.status === 'error' && <Text style={styles.empty}>Couldn’t load the earlier questions.</Text>}
        {chat.status === 'ready' && chat.turns.length === 0 && (
          <Text style={styles.empty}>Ask about the lecture, or tap a quick prompt below. Answers come from what has been said so far.</Text>
        )}
        {chat.turns.map(turnView)}
      </ScrollView>

      {offline && (
        <Text style={styles.offline} {...{ dataSet: { assistant: 'offline' } }}>
          {OFFLINE_NOTE}
        </Text>
      )}
      <ScrollView
        ref={chipsScroll}
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
        {...{ dataSet: { assistant: 'chips' } }}
      >
        {QUICK_PROMPT_ORDER.map((key) => (
          <Pressable
            key={key}
            onPress={() => chat.ask('', key)}
            disabled={!canAsk}
            aria-disabled={!canAsk}
            style={({ pressed }) => [styles.chip, !canAsk && styles.off, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={QUICK_PROMPTS[key].label}
            {...{ dataSet: { assistant: 'chip', quickPrompt: key } }}
          >
            <Text style={[styles.chipText, panel && styles.chipTextPanel]}>{QUICK_PROMPTS[key].label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {panel ? (
        <View style={styles.composerPanel} {...{ dataSet: { assistant: 'composer' } }}>
          <TextInput
            value={chat.draft}
            onChangeText={chat.setDraft}
            placeholder="Ask about the lecture…"
            placeholderTextColor={c.text.placeholder}
            multiline
            style={styles.inputPanel}
            accessibilityLabel="Ask about the lecture"
            // Enter sends, Shift+Enter a new line (the laptop).
            onKeyPress={(e) => {
              const key = e.nativeEvent as { key?: string; shiftKey?: boolean };
              if (key.key === 'Enter' && !key.shiftKey) {
                (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                send();
              }
            }}
          />
          <View style={styles.composerRow}>
            <Pressable
              onPress={() => setNotice({ where: 'composer', text: 'Attaching files comes later.' })}
              style={styles.plus}
              accessibilityRole="button"
              accessibilityLabel="Attach"
              {...{ dataSet: { assistant: 'attach' } }}
            >
              <Ionicons name="add" size={18} color={c.text.primary} />
            </Pressable>
            <View style={styles.context}>
              <Text style={styles.contextText}>Context: this lecture</Text>
            </View>
            <View style={styles.fill} />
            <Pressable
              onPress={send}
              disabled={!canSend}
              aria-disabled={!canSend}
              style={[styles.sendSquare, canSend && styles.sendSquareOn]}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              {...{ dataSet: { assistant: 'send' } }}
            >
              <Ionicons name="arrow-up" size={18} color={canSend ? c.accentOn : c.white} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.composerSheet} {...{ dataSet: { assistant: 'composer' } }}>
          <TextInput
            value={chat.draft}
            onChangeText={chat.setDraft}
            placeholder="Ask about the lecture…"
            placeholderTextColor={c.text.placeholder}
            multiline
            style={styles.inputSheet}
            accessibilityLabel="Ask about the lecture"
          />
          <Pressable
            onPress={send}
            disabled={!canSend}
            aria-disabled={!canSend}
            style={[styles.sendRound, !canSend && styles.sendRoundOff]}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend }}
            {...{ dataSet: { assistant: 'send' } }}
          >
            <Ionicons name="arrow-up" size={17} color={canSend ? c.button.primaryText : c.button.disabledText} />
          </Pressable>
        </View>
      )}
      {notice?.where === 'composer' && (
        <Text style={[styles.notice, styles.noticeComposer]} {...{ dataSet: { assistant: 'notice' } }}>
          {notice.text}
        </Text>
      )}
      {panel && <Text style={styles.footer}>Answers come from the lecture transcript and are saved to your summary.</Text>}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    fill: { flex: 1 },
    conversation: { padding: 16, gap: 22 },
    conversationSheet: { paddingHorizontal: 18, paddingTop: 16 },
    empty: { fontSize: Typography.size.sm, lineHeight: 19, color: c.text.secondary },
    turn: { gap: 10 },
    bubbleRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    bubble: { maxWidth: '88%', backgroundColor: c.surfaceMuted, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
    bubblePanel: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10 },
    bubbleText: { fontSize: Typography.size.base, color: c.text.primary, flexShrink: 1 },
    bubbleTextSheet: { fontSize: Typography.size.base + 1 },
    window: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, color: c.text.primary, letterSpacing: 0.5 },
    windowPanel: { textTransform: 'uppercase', letterSpacing: 1 },
    thinking: { fontSize: Typography.size.sm, color: c.text.secondary, fontStyle: 'italic' },
    errorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    errorText: { fontSize: Typography.size.sm, color: c.error, flexShrink: 1 },
    retryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    iconButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    pill: { height: 30, paddingHorizontal: 11, borderRadius: 15, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, justifyContent: 'center' },
    pillText: { fontSize: Typography.size.sm, color: c.text.primary },
    notice: { fontSize: Typography.size.xs, color: c.text.secondary },
    noticeComposer: { paddingHorizontal: 16, paddingBottom: 4 },
    pressed: { opacity: 0.7 },
    off: { opacity: 0.45 },
    offline: { fontSize: Typography.size.xs, color: c.status.warning.text, backgroundColor: c.status.warning.bg, paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 14, marginBottom: 6, borderRadius: 8 },
    chipsScroll: { flexGrow: 0 },
    chips: { gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
    chip: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: c.salmon, backgroundColor: c.salmonLight, justifyContent: 'center' },
    chipText: { fontSize: Typography.size.sm, color: c.markButton.confused.text },
    chipTextPanel: { fontSize: 12.5 },
    composerPanel: { marginHorizontal: 14, marginTop: 4, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 12, gap: 10, backgroundColor: c.card },
    inputPanel: { minHeight: 44, maxHeight: 140, fontSize: Typography.size.base, lineHeight: 21, color: c.text.primary, padding: 0, outlineStyle: 'none' } as object,
    composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    plus: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    context: { height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: c.surfaceMuted, justifyContent: 'center' },
    contextText: { fontSize: Typography.size.xs + 1, color: c.text.secondary },
    sendSquare: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.button.disabled, alignItems: 'center', justifyContent: 'center' },
    sendSquareOn: { backgroundColor: c.accentDark },
    footer: { fontSize: Typography.size.xs, color: c.text.secondary, textAlign: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
    composerSheet: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 4, minHeight: 50, borderWidth: 1, borderColor: c.border, borderRadius: 25, paddingLeft: 16, paddingRight: 6, backgroundColor: c.card },
    inputSheet: { flex: 1, maxHeight: 110, fontSize: Typography.size.base + 1, color: c.text.primary, paddingVertical: 12, outlineStyle: 'none' } as object,
    sendRound: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.button.primary, alignItems: 'center', justifyContent: 'center' },
    sendRoundOff: { backgroundColor: c.button.disabled },
  });
