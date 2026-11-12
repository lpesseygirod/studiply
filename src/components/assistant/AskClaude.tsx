import { useCallback, useEffect, useState, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { isOffline } from '../../lib/connectivity';
import type { StudiplyEditorHandle } from '../../editor/types';
import type { AskClaudeAnchor } from '../../editor/format/selectionBar';
import {
  MAX_SELECTION_CHARS,
  SELECTION_ACTIONS,
  SELECTION_ACTION_ORDER,
  askAboutSelection,
  type Card,
  type SelectionAction,
} from '../../services/assistant-actions.service';
import { saveFlashcards, savedText } from '../../services/flashcards.service';
import { errorMessage } from '../../utils/errors';
import { extrasRefusal } from '../../lib/credits/extras';
import type { ShowUndo } from '../../utils/star';
import { showActionSheet, showAlert } from '../dialogs/dialogs';
import { DragSheet } from '../DragSheet';
import { AssistantAnswer } from './AssistantAnswer';
import { CardsList } from './CardsList';

/** How often the card looks whether the asked text changed (Accept becomes Insert below). */
const STALE_POLL_MS = 500;

export interface AskState {
  action: SelectionAction;
  /** Laptop: under the selection bar's button, inside the editor as seen (window coordinates). */
  anchor?: AskClaudeAnchor;
  status: 'thinking' | 'suggestion' | 'cards' | 'error';
  text?: string;
  cards?: Card[];
  error?: string;
  /** The asked text changed since: a replace goes below instead. */
  stale: boolean;
  saving: boolean;
}

/**
 * Ask Claude on a selection (step 6.3): the selection bar's "✦ Ask Claude" →
 * the five actions (an action sheet: a menu at the button on the laptop) →
 * Claude's suggestion, to Accept (in place, or below) or Reject; Make
 * flashcard → the cards, Save cards · Discard. The editor keeps the range
 * (schema/suggestion); nothing changes until Accept or Save.
 */
export function useAskClaude({
  fileId,
  courseId,
  editorRef,
  showUndo,
}: {
  fileId: string | null;
  courseId: string | null;
  editorRef: RefObject<StudiplyEditorHandle | null>;
  showUndo: ShowUndo;
}) {
  const [ask, setAsk] = useState<AskState | null>(null);
  const run = (cmd: Parameters<StudiplyEditorHandle['run']>[0]) => editorRef.current?.run(cmd);
  const clear = useCallback(() => {
    editorRef.current?.run({ type: 'suggestion', action: 'clear' });
    setAsk(null);
  }, [editorRef]);

  const start = async (action: SelectionAction, text: string, context: string, anchor?: AskState['anchor']) => {
    if (!fileId) return;
    setAsk({ action, anchor, status: 'thinking', stale: false, saving: false });
    try {
      const r = await askAboutSelection({ fileId, action, text, context });
      setAsk((cur) =>
        cur && cur.action === action ? { ...cur, ...(r.kind === 'cards' ? { status: 'cards', cards: r.cards } : { status: 'suggestion', text: r.text }) } : cur,
      );
    } catch (err) {
      // Step 10.2-1b: the assistant & extras allowance used up says so.
      setAsk((cur) => (cur ? { ...cur, status: 'error', error: extrasRefusal(err) ?? errorMessage(err, 'Claude could not answer. Nothing was changed.') } : cur));
    }
  };

  /** The selection bar's "✦ Ask Claude": the actions for the selection the editor now keeps. */
  const onAskClaude = useCallback(
    async (anchor?: AskClaudeAnchor) => {
      const info = await editorRef.current?.suggestion();
      if (!info?.text) return clear();
      if (isOffline()) {
        clear();
        return showAlert('Ask Claude needs the internet', 'Nothing was sent. Try again once you are online.');
      }
      if (info.text.length > MAX_SELECTION_CHARS) {
        clear();
        return showAlert('Select less text', `Ask Claude takes up to ${MAX_SELECTION_CHARS.toLocaleString('en')} characters at a time.`);
      }
      showActionSheet(
        'Ask Claude',
        [
          ...SELECTION_ACTION_ORDER.map((a) => ({ text: SELECTION_ACTIONS[a].label, onPress: () => void start(a, info.text, info.context, anchor) })),
          { text: 'Cancel', style: 'cancel' as const, onPress: clear },
        ],
        { anchor },
      );
    },
    // `start` reads only fileId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorRef, clear, fileId],
  );

  // While a suggestion waits: did the asked text change? (Accept becomes Insert below.) Gone: closed.
  const waiting = ask?.status === 'suggestion';
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      void editorRef.current?.suggestion().then((info) => {
        if (!info) setAsk(null);
        else setAsk((cur) => (cur && cur.stale !== info.stale ? { ...cur, stale: info.stale } : cur));
      });
    }, STALE_POLL_MS);
    return () => clearInterval(t);
  }, [waiting, editorRef]);

  const accept = () => {
    if (!ask?.text) return;
    const result = SELECTION_ACTIONS[ask.action].result;
    if (result === 'replaces') run({ type: 'suggestion', action: 'replace', text: ask.text });
    else run({ type: 'suggestion', action: 'below', text: ask.text, kind: result === 'example' ? 'example' : 'addedContext' });
    setAsk(null);
  };

  const saveCards = async () => {
    if (!ask?.cards || !fileId) return;
    setAsk({ ...ask, saving: true });
    try {
      const saved = await saveFlashcards(ask.cards, { fileId, courseId, source: 'selection', sourceRef: fileId });
      clear();
      showUndo(savedText(saved.count), () => void saved.undo().catch(() => {}));
    } catch (err) {
      setAsk((cur) => (cur ? { ...cur, saving: false, status: 'error', error: errorMessage(err, 'Could not save the flashcards.') } : cur));
    }
  };

  return { ask, onAskClaude, accept, reject: clear, saveCards };
}

/**
 * The suggestion (step 6.3): a card under the selection on the laptop, a sheet on the iPhone (and the
 * web below 1024 px): what Claude suggests, then Accept (Insert below when the text changed) · Reject;
 * or the proposed cards, Save cards · Discard. Built from the app's existing styles.
 */
export function AskClaudeCard({
  ask,
  layout,
  onAccept,
  onReject,
  onSaveCards,
}: {
  ask: AskState | null;
  layout: 'card' | 'sheet';
  onAccept: () => void;
  onReject: () => void;
  onSaveCards: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { width, height } = useWindowDimensions();
  const [cardHeight, setCardHeight] = useState(0);
  if (layout === 'sheet') {
    return (
      <DragSheet visible={!!ask} onClose={onReject} closeLabel="Reject the suggestion">
        {ask && <Body ask={ask} onAccept={onAccept} onReject={onReject} onSaveCards={onSaveCards} />}
      </DragSheet>
    );
  }
  if (!ask) return null;
  // Inside the editor as seen (not over the assistant panel or off the page), like the other popovers:
  // shifted left to fit, and above the selection bar when there is no room under it.
  const room = ask.anchor?.bounds ?? { left: 0, right: width, top: 0, bottom: height };
  const cardWidth = Math.max(0, Math.min(380, room.right - room.left - 16));
  const left = Math.max(room.left + 8, Math.min((ask.anchor?.x ?? room.left + 24) - 8, room.right - cardWidth - 8));
  const under = ask.anchor?.y ?? room.top + 120;
  const over = (ask.anchor?.above ?? under) - cardHeight;
  const top =
    under + cardHeight <= room.bottom - 8 || over < room.top + 8 ? Math.max(room.top + 8, Math.min(under, room.bottom - 8 - cardHeight)) : over;
  return (
    <View
      style={[styles.card, { width: cardWidth, left, top }]}
      onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
      accessibilityRole="none"
      {...{ dataSet: { ask: 'card' } }}
    >
      <Body ask={ask} onAccept={onAccept} onReject={onReject} onSaveCards={onSaveCards} />
    </View>
  );
}

function Body({ ask, onAccept, onReject, onSaveCards }: { ask: AskState; onAccept: () => void; onReject: () => void; onSaveCards: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const replaces = SELECTION_ACTIONS[ask.action].result === 'replaces';
  return (
    <View style={styles.body} {...{ dataSet: { ask: 'body', status: ask.status } }}>
      <Text style={styles.label}>✦ Ask Claude · {SELECTION_ACTIONS[ask.action].label}</Text>
      {ask.status === 'thinking' && <Text style={styles.muted}>Thinking…</Text>}
      {ask.status === 'error' && (
        <>
          <Text style={styles.error} {...{ dataSet: { ask: 'error' } }}>
            {ask.error}
          </Text>
          <View style={styles.buttons}>{button('Close', onReject, false, 'close')}</View>
        </>
      )}
      {ask.status === 'suggestion' && ask.text && (
        <>
          <ScrollView style={styles.scroll} {...{ dataSet: { ask: 'suggestion' } }}>
            <AssistantAnswer text={ask.text} size="panel" lengthMs={null} onTime={() => {}} />
          </ScrollView>
          {ask.stale && replaces && (
            <Text style={styles.muted} {...{ dataSet: { ask: 'stale' } }}>
              The text changed since you asked: this goes below it, so your change stays.
            </Text>
          )}
          <View style={styles.buttons}>
            {button(ask.stale && replaces ? 'Insert below' : 'Accept', onAccept, true, 'accept')}
            {button('Reject', onReject, false, 'reject')}
          </View>
        </>
      )}
      {ask.status === 'cards' && ask.cards && <CardsList cards={ask.cards} saving={ask.saving} onSave={onSaveCards} onDiscard={onReject} />}
    </View>
  );

  function button(text: string, onPress: () => void, primary: boolean, key: string) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [primary ? styles.primary : styles.secondary, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={text}
        {...{ dataSet: { ask: key } }}
      >
        <Text style={primary ? styles.primaryText : styles.secondaryText}>{text}</Text>
      </Pressable>
    );
  }
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // The laptop: under the selection, above the page, like the link bubble.
    card: {
      position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
      zIndex: 50,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      shadowColor: c.shadow,
      shadowOpacity: 0.14,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    body: { gap: 10, paddingBottom: 4 },
    label: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 0.5, color: c.accentDark, textTransform: 'uppercase' },
    muted: { fontSize: Typography.size.sm, color: c.text.secondary },
    error: { fontSize: Typography.size.sm, color: c.error },
    scroll: { maxHeight: 320 },
    buttons: { flexDirection: 'row', gap: 8 },
    primary: { height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: c.button.primary, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    secondary: { height: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.sm, color: c.text.primary },
    pressed: { opacity: 0.7 },
  });
