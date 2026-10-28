import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useKeyboardAccessory } from '@10play/tentap-editor';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { FormatCommand, FormatState } from '../format';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * The iPhone's keyboard toolbar (step 4.4, DESIGN: scrolls sideways): Aa ·
 * B I U S · text colour · highlight · lists · indent − + · undo · redo, and
 * Done at the right. Aa and the colours open their panels in place of the
 * keyboard. Registered as a keyboard accessory, so the caret stays above it.
 */
export function KeyboardToolbar({
  state,
  run,
  panel,
  onPanel,
  onDone,
  onLink,
  onOpenLink,
}: {
  state: FormatState | undefined;
  run: (cmd: FormatCommand) => void;
  /** The panel open in place of the keyboard, if any. */
  panel: 'aa' | 'colors' | undefined;
  onPanel: (panel: 'aa' | 'colors') => void;
  onDone: () => void;
  /** Add or edit a link (asks for the address). */
  onLink: () => void;
  onOpenLink: (href: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const accessory = useKeyboardAccessory(true);

  const button = (label: string, icon: IconName, onPress: () => void, { active = false, disabled = false } = {}) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, active && styles.active, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
    >
      <MaterialCommunityIcons name={icon} size={22} color={active ? c.accentDark : c.text.primary} />
    </Pressable>
  );
  const s = state;

  return (
    <View style={styles.bar} onLayout={accessory.onLayout}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.items}>
        {s?.link ? (
          // On a link: what to do with it comes first.
          <View style={styles.linkChips}>
            {[
              { label: 'Open', onPress: () => onOpenLink(s.link!) },
              { label: 'Edit', onPress: onLink },
              { label: 'Remove', onPress: () => run({ type: 'link', href: null }) },
            ].map((a) => (
              <Pressable key={a.label} onPress={a.onPress} style={styles.linkChip} accessibilityRole="button" accessibilityLabel={`${a.label} link`}>
                <Text style={styles.linkChipText}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Pressable
          onPress={() => onPanel('aa')}
          style={[styles.button, styles.aa, panel === 'aa' && styles.active]}
          accessibilityRole="button"
          accessibilityLabel="Text style and size"
          accessibilityState={{ selected: panel === 'aa' }}
        >
          <Text style={[styles.aaText, panel === 'aa' && { color: c.accentDark }]}>Aa</Text>
        </Pressable>
        {button('Bold', 'format-bold', () => run({ type: 'mark', mark: 'bold' }), { active: s?.bold })}
        {button('Italic', 'format-italic', () => run({ type: 'mark', mark: 'italic' }), { active: s?.italic })}
        {button('Underline', 'format-underline', () => run({ type: 'mark', mark: 'underline' }), { active: s?.underline })}
        {button('Strikethrough', 'format-strikethrough-variant', () => run({ type: 'mark', mark: 'strike' }), { active: s?.strike })}
        {button('Text colour and highlight', 'palette-outline', () => onPanel('colors'), { active: panel === 'colors' })}
        {button('Link', 'link-variant', onLink, { active: !!s?.link })}
        {button('Bulleted list', 'format-list-bulleted', () => run({ type: 'list', list: 'bullet' }), { active: s?.list === 'bullet' })}
        {button('Numbered list', 'format-list-numbered', () => run({ type: 'list', list: 'ordered' }), { active: s?.list === 'ordered' })}
        {button('Checklist', 'format-list-checks', () => run({ type: 'list', list: 'task' }), { active: s?.list === 'task' })}
        {button('Decrease indent', 'format-indent-decrease', () => run({ type: 'outdent' }), { disabled: s ? !s.canOutdent : false })}
        {button('Increase indent', 'format-indent-increase', () => run({ type: 'indent' }), { disabled: s ? !s.canIndent : false })}
        {button('Undo', 'undo', () => run({ type: 'undo' }), { disabled: s ? !s.canUndo : false })}
        {button('Redo', 'redo', () => run({ type: 'redo' }), { disabled: s ? !s.canRedo : false })}
      </ScrollView>
      <Pressable onPress={onDone} style={styles.done} accessibilityRole="button" accessibilityLabel="Hide keyboard">
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: c.card,
    },
    items: { alignItems: 'center', paddingHorizontal: 4 },
    button: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    aa: { width: 48 },
    aaText: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    active: { backgroundColor: c.accentLight },
    disabled: { opacity: 0.35 },
    linkChips: { flexDirection: 'row', gap: 4, marginRight: 6, paddingRight: 6, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: c.border },
    linkChip: { height: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: c.accentLight },
    linkChipText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    done: {
      height: 48,
      paddingHorizontal: 14,
      justifyContent: 'center',
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: c.border,
    },
    doneText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.accentDark },
  });
