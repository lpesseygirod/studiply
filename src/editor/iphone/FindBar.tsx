import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { FormatCommand } from '../format';
import type { FindState } from '../writing/find';

/**
 * The iPhone's find & replace (step 4.7; the document menu's Find and
 * replace): a bar over the text with the search box, "3 of 12", up and
 * down, Aa (match case), Whole words, Replace (its own line: Replace,
 * All) and Done. The matching is the WebView's (writing/find.ts), through
 * the format bridge.
 */
export function FindBar({ state, run, replace, onReplace, onClose }: { state: FindState | null; run: (cmd: FormatCommand) => void; replace: boolean; onReplace: (on: boolean) => void; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWords, setWholeWords] = useState(false);
  const [replacement, setReplacement] = useState('');

  useEffect(() => {
    run({ type: 'find', action: 'search', query, matchCase, wholeWords });
  }, [run, query, matchCase, wholeWords]);
  // Closing takes the highlights away.
  useEffect(() => () => run({ type: 'find', action: 'close' }), [run]);

  const none = !state || state.count === 0;
  const count = !query ? '' : none ? 'None' : `${state!.current + 1} of ${state!.count}`;
  const toggle = (label: string, short: string, on: boolean, set: (v: boolean) => void) => (
    <Pressable onPress={() => set(!on)} style={[styles.toggle, on && styles.toggleOn]} accessibilityRole="checkbox" {...a11yState({ checked: on })} accessibilityLabel={label}>
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{short}</Text>
    </Pressable>
  );
  const icon = (name: React.ComponentProps<typeof MaterialCommunityIcons>['name'], label: string, onPress: () => void, disabled = false) => (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.icon, disabled && styles.off]} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <MaterialCommunityIcons name={name} size={24} color={c.text.primary} />
    </Pressable>
  );

  return (
    <View style={styles.bar}>
      <View style={styles.line}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => run({ type: 'find', action: 'next' })}
          blurOnSubmit={false}
          returnKeyType="search"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          placeholder="Find in document"
          placeholderTextColor={c.text.placeholder}
          style={styles.input}
          accessibilityLabel="Find in document"
        />
        <Text style={styles.count} accessibilityLiveRegion="polite">
          {count}
        </Text>
        {icon('chevron-up', 'Previous match', () => run({ type: 'find', action: 'previous' }), none)}
        {icon('chevron-down', 'Next match', () => run({ type: 'find', action: 'next' }), none)}
        <Pressable onPress={onClose} style={styles.done} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.line}>
        {toggle('Match case', 'Aa', matchCase, setMatchCase)}
        {toggle('Whole words', 'Whole words', wholeWords, setWholeWords)}
        {toggle('Replace', 'Replace', replace, onReplace)}
      </View>
      {replace && (
        <View style={styles.line}>
          <TextInput
            value={replacement}
            onChangeText={setReplacement}
            autoCorrect={false}
            autoCapitalize="none"
            placeholder="Replace with"
            placeholderTextColor={c.text.placeholder}
            style={styles.input}
            accessibilityLabel="Replace with"
          />
          <Pressable onPress={() => run({ type: 'find', action: 'replace', text: replacement })} disabled={none} style={[styles.button, none && styles.off]} accessibilityRole="button">
            <Text style={styles.buttonText}>Replace</Text>
          </Pressable>
          <Pressable
            onPress={() => run({ type: 'find', action: 'replaceAll', text: replacement })}
            disabled={none}
            style={[styles.button, styles.buttonPrimary, none && styles.off]}
            accessibilityRole="button"
            accessibilityLabel="Replace all"
          >
            <Text style={[styles.buttonText, styles.buttonTextPrimary]}>All</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: { gap: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: c.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    input: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 10, borderRadius: 10, backgroundColor: c.cardMuted, fontSize: Typography.size.base, color: c.text.primary },
    count: { minWidth: 56, fontSize: Typography.size.xs, color: c.text.secondary, textAlign: 'center' },
    icon: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
    off: { opacity: 0.35 },
    done: { height: 44, paddingHorizontal: 8, justifyContent: 'center' },
    doneText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.accentDark },
    toggle: { height: 34, paddingHorizontal: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardMuted },
    toggleOn: { backgroundColor: c.accentLight },
    toggleText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.secondary },
    toggleTextOn: { color: c.accentDark },
    button: { height: 40, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardMuted },
    buttonPrimary: { backgroundColor: c.accentDark },
    buttonText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    buttonTextPrimary: { color: c.accentOn },
  });
