import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Editor } from '@tiptap/react';

import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { a11yState } from '../utils/a11y';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { runFormat } from './format';
import { findState } from './writing/find';

/**
 * The laptop's find & replace bar (step 4.7), under the toolbar: ⌘F opens
 * it (with words selected, they are the search), ⌘⇧H with Replace. Enter
 * goes to the next match, ⇧Enter to the previous, Esc closes it and goes
 * back to the text. The matches, highlights and replacing are the shared
 * editor's (writing/find.ts).
 */
export function FindBar({
  editor,
  replace,
  opened,
  onReplace,
  onClose,
}: {
  editor: Editor;
  replace: boolean;
  /** Counts each ⌘F / ⌘⇧H / menu press: the search box takes the focus again, also when the bar is already open. */
  opened: number;
  onReplace: (on: boolean) => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  // Words selected in the text (one line, at most 100 characters) are the search.
  const selected = () => {
    const { from, to, empty } = editor.state.selection;
    const text = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    return text.length <= 100 && !text.includes('\n') ? text : '';
  };
  const [query, setQuery] = useState(selected);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWords, setWholeWords] = useState(false);
  const [replacement, setReplacement] = useState('');
  const input = useRef<TextInput>(null);
  const bar = useRef<View>(null);
  const state = findState(editor.state);

  // As typed: the matches, the first one after the cursor shown.
  useEffect(() => {
    runFormat(editor, { type: 'find', action: 'search', query, matchCase, wholeWords });
  }, [editor, query, matchCase, wholeWords]);
  const first = useRef(true);
  useEffect(() => {
    // Opened again (⌘F with the bar open): newly selected words become the search.
    if (!first.current) {
      const words = selected();
      if (words) setQuery(words);
    }
    first.current = false;
    // After the frame, so a menu that hands the focus back as it closes doesn't take it from the box.
    const frame = requestAnimationFrame(() => {
      input.current?.focus();
      // The words that were selected (or the last search) are ready to type over.
      (input.current as unknown as HTMLInputElement | null)?.select?.();
    });
    return () => cancelAnimationFrame(frame);
    // Only when opened: `selected` reads the editor at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  // Closing takes the highlights away.
  useEffect(() => () => void runFormat(editor, { type: 'find', action: 'close' }), [editor]);

  const go = (action: 'next' | 'previous') => runFormat(editor, { type: 'find', action });
  const close = () => {
    onClose();
    editor.commands.focus();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  // Esc closes the bar from anywhere in it, or when the focus is nowhere (the page itself).
  useEffect(() => {
    const node = bar.current as unknown as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const at = document.activeElement;
      if (!(node?.contains(at) || !at || at === document.body)) return;
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
    };
    // Captured: the text box's own key handling stops Esc before it reaches the window.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
  // Replace, Replace all: when no match is left their buttons turn off (and would drop the focus), so it goes to the search box.
  const replaceWith = (action: 'replace' | 'replaceAll') => {
    runFormat(editor, { type: 'find', action, text: replacement });
    if (!findState(editor.state)?.count) input.current?.focus();
  };
  const onKey = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, enter: () => void) => {
    const ev = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (ev.key !== 'Enter') return;
    (e as unknown as { preventDefault: () => void }).preventDefault();
    if (ev.shiftKey) go('previous');
    else enter();
  };

  const count = !query ? '' : !state || state.count === 0 ? 'No results' : `${state.current + 1} of ${state.count}`;
  const toggle = (label: string, on: boolean, set: (v: boolean) => void, short: string) => (
    <Pressable
      onPress={() => set(!on)}
      style={({ hovered }: { hovered?: boolean }) => [styles.toggle, on ? styles.toggleOn : hovered && styles.hover]}
      accessibilityRole="checkbox"
      aria-checked={on}
      {...a11yState({ checked: on })}
      accessibilityLabel={label}
    >
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{short}</Text>
    </Pressable>
  );
  const icon = (name: React.ComponentProps<typeof MaterialCommunityIcons>['name'], label: string, onPress: () => void, disabled = false) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ hovered }: { hovered?: boolean }) => [styles.icon, hovered && !disabled && styles.hover, disabled && styles.off]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={name} size={20} color={c.text.primary} />
    </Pressable>
  );
  const none = !state || state.count === 0;

  return (
    <View ref={bar} style={styles.bar} accessibilityRole="search" {...{ dataSet: { find: 'bar' } }}>
      <View style={styles.line}>
        <TextInput
          ref={input}
          value={query}
          onChangeText={setQuery}
          onKeyPress={(e) => onKey(e, () => go('next'))}
          placeholder="Find in document"
          placeholderTextColor={c.text.placeholder}
          style={styles.input}
          accessibilityLabel="Find in document"
          autoCorrect={false}
          spellCheck={false}
        />
        <Text style={styles.count} accessibilityLiveRegion="polite" {...{ dataSet: { find: 'count' } }}>
          {count}
        </Text>
        {icon('chevron-up', 'Previous match', () => go('previous'), none)}
        {icon('chevron-down', 'Next match', () => go('next'), none)}
        {toggle('Match case', matchCase, setMatchCase, 'Aa')}
        {toggle('Whole words', wholeWords, setWholeWords, 'Whole words')}
        {toggle('Replace', replace, onReplace, 'Replace')}
        {icon('close', 'Close find', close)}
      </View>
      {replace && (
        <View style={styles.line}>
          <TextInput
            value={replacement}
            onChangeText={setReplacement}
            onKeyPress={(e) => onKey(e, () => replaceWith('replace'))}
            placeholder="Replace with"
            placeholderTextColor={c.text.placeholder}
            style={styles.input}
            accessibilityLabel="Replace with"
            autoCorrect={false}
            spellCheck={false}
          />
          <Pressable
            onPress={() => replaceWith('replace')}
            disabled={none}
            style={({ hovered }: { hovered?: boolean }) => [styles.button, hovered && !none && styles.hover, none && styles.off]}
            accessibilityRole="button"
            accessibilityLabel="Replace this match"
          >
            <Text style={styles.buttonText}>Replace</Text>
          </Pressable>
          <Pressable
            onPress={() => replaceWith('replaceAll')}
            disabled={none}
            style={({ hovered }: { hovered?: boolean }) => [styles.button, styles.buttonPrimary, hovered && !none && styles.primaryHover, none && styles.off]}
            accessibilityRole="button"
            accessibilityLabel="Replace all"
          >
            <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Replace all</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: { gap: 6, padding: 8, borderRadius: 12, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    line: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    input: {
      flexGrow: 1,
      flexBasis: 180,
      minWidth: 0,
      height: 34,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: Typography.size.sm,
      color: c.text.primary,
      backgroundColor: c.card,
    },
    count: { minWidth: 72, fontSize: Typography.size.xs, color: c.text.secondary, textAlign: 'center', fontVariant: ['tabular-nums'] },
    icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    hover: { backgroundColor: c.cardMuted },
    off: { opacity: 0.4 },
    toggle: { height: 30, paddingHorizontal: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    toggleOn: { backgroundColor: c.accentLight },
    toggleText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary },
    toggleTextOn: { color: c.accentDark },
    button: { height: 32, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardMuted },
    buttonPrimary: { backgroundColor: c.accentDark },
    primaryHover: { opacity: 0.9 },
    buttonText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    buttonTextPrimary: { color: c.accentOn },
  });
