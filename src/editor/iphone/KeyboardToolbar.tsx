import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useKeyboardAccessory } from '@10play/tentap-editor';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { FormatCommand, FormatState } from '../format';
import { PHOTO_WIDTHS } from '../schema/photo';
import type { CommentInfo } from '../schema/comments';
import { useToolbarExpanded } from '../../lib/toolbarPrefs';
import { splitRow } from '../toolbarFit';

const TOOL_W = 44;
const AA_W = 48;
const TOOLS_PADDING = 8;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type Panel = 'aa' | 'colors' | 'insert' | 'table';

/**
 * The iPhone's keyboard toolbar (steps 4.4, 4.5), like the laptop's (Lea,
 * test B): one row of tools in the laptop's order (Aa · B I U · colours ·
 * lists · link · + · Table in a table · then strikethrough, checklist,
 * indent, undo, redo), never scrolling: what doesn't fit this iPhone's width
 * goes to a second row above, opened with the arrow at the right (open or
 * closed is remembered on this iPhone), with Done at the end. What to do
 * with the link, comment, photo or maths at the cursor comes on a row of
 * its own above the tools. Aa, the colours, + and Table open their panels
 * in place of the keyboard. A keyboard accessory, so the caret stays above.
 */
export function KeyboardToolbar({
  state,
  run,
  panel,
  onPanel,
  onDone,
  onLink,
  onOpenLink,
  onComment,
  onPhotoLayout,
}: {
  state: FormatState | undefined;
  run: (cmd: FormatCommand) => void;
  /** The panel open in place of the keyboard, if any. */
  panel: Panel | undefined;
  onPanel: (panel: Panel) => void;
  onDone: () => void;
  /** Add or edit a link (asks for the address). */
  onLink: () => void;
  onOpenLink: (href: string) => void;
  /** The cursor is in commented words: open that comment. */
  onComment: (comment: CommentInfo) => void;
  /** A photo is selected: its layout (in line, wrap, break text) and alignment. */
  onPhotoLayout: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const accessory = useKeyboardAccessory(true);
  const [more, setMore] = useToolbarExpanded('iphone');
  const [room, setRoom] = useState(320);

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

  // The tools in the laptop's order (Lea): what fits stays in the row, the rest goes to the second row.
  const tools: { key: string; width: number; node: React.ReactNode }[] = [
    {
      key: 'aa',
      width: AA_W,
      node: (
        <Pressable
          key="aa"
          onPress={() => onPanel('aa')}
          style={[styles.button, styles.aa, panel === 'aa' && styles.active]}
          accessibilityRole="button"
          accessibilityLabel="Text style and size"
          accessibilityState={{ selected: panel === 'aa' }}
        >
          <Text style={[styles.aaText, panel === 'aa' && { color: c.accentDark }]}>Aa</Text>
        </Pressable>
      ),
    },
    { key: 'bold', width: TOOL_W, node: button('Bold', 'format-bold', () => run({ type: 'mark', mark: 'bold' }), { active: s?.bold }) },
    { key: 'italic', width: TOOL_W, node: button('Italic', 'format-italic', () => run({ type: 'mark', mark: 'italic' }), { active: s?.italic }) },
    { key: 'underline', width: TOOL_W, node: button('Underline', 'format-underline', () => run({ type: 'mark', mark: 'underline' }), { active: s?.underline }) },
    { key: 'colours', width: TOOL_W, node: button('Text colour and highlight', 'palette-outline', () => onPanel('colors'), { active: panel === 'colors' }) },
    { key: 'bullet', width: TOOL_W, node: button('Bulleted list', 'format-list-bulleted', () => run({ type: 'list', list: 'bullet' }), { active: s?.list === 'bullet' }) },
    { key: 'ordered', width: TOOL_W, node: button('Numbered list', 'format-list-numbered', () => run({ type: 'list', list: 'ordered' }), { active: s?.list === 'ordered' }) },
    { key: 'link', width: TOOL_W, node: button('Link', 'link-variant', onLink, { active: !!s?.link }) },
    { key: 'insert', width: TOOL_W, node: button('Insert', 'plus-circle-outline', () => onPanel('insert'), { active: panel === 'insert' }) },
    ...(s?.inTable ? [{ key: 'table', width: TOOL_W, node: button('Table', 'table-edit', () => onPanel('table'), { active: panel === 'table' }) }] : []),
    { key: 'strike', width: TOOL_W, node: button('Strikethrough', 'format-strikethrough-variant', () => run({ type: 'mark', mark: 'strike' }), { active: s?.strike }) },
    { key: 'task', width: TOOL_W, node: button('Checklist', 'format-list-checks', () => run({ type: 'list', list: 'task' }), { active: s?.list === 'task' }) },
    { key: 'outdent', width: TOOL_W, node: button('Decrease indent', 'format-indent-decrease', () => run({ type: 'outdent' }), { disabled: s ? !s.canOutdent : false }) },
    { key: 'indent', width: TOOL_W, node: button('Increase indent', 'format-indent-increase', () => run({ type: 'indent' }), { disabled: s ? !s.canIndent : false }) },
    { key: 'undo', width: TOOL_W, node: button('Undo', 'undo', () => run({ type: 'undo' }), { disabled: s ? !s.canUndo : false }) },
    { key: 'redo', width: TOOL_W, node: button('Redo', 'redo', () => run({ type: 'redo' }), { disabled: s ? !s.canRedo : false }) },
  ];
  // Room for the tools: the row less the arrow (when anything has to move).
  const all = splitRow(tools, room);
  const { fits, overflow } = all.overflow.length ? splitRow(tools, room - TOOL_W) : all;
  const hasChips = !!(s?.link || s?.mathSuggestion || s?.comment || s?.photo);

  return (
    <View onLayout={accessory.onLayout}>
      {/* The second row: what didn't fit (open or closed is remembered on this iPhone). */}
      {more && overflow.length > 0 && <View style={[styles.bar, styles.moreRow, styles.wrapRow]}>{overflow.map((t) => t.node)}</View>}
      {hasChips && (
        // What to do with the link, comment, photo or maths at the cursor comes first, on its own row.
        <View style={[styles.bar, styles.chipRow]}>
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
            {s?.mathSuggestion ? (
              // Maths typed as text: offered as a formula (nothing changes unless pressed).
              <View style={styles.linkChips}>
                <Pressable
                  onPress={() => run({ type: 'formula', action: 'acceptSuggestion' })}
                  style={styles.linkChip}
                  accessibilityRole="button"
                  accessibilityLabel={`Make formula: ${s.mathSuggestion.latex}`}
                >
                  <Text style={styles.linkChipText}>Make formula</Text>
                </Pressable>
              </View>
            ) : null}
            {s?.comment ? (
              // In commented words: the comment comes first.
              <View style={styles.linkChips}>
                <Pressable onPress={() => onComment(s.comment!)} style={styles.linkChip} accessibilityRole="button" accessibilityLabel="Open the comment">
                  <Text style={styles.linkChipText}>{s.comment.resolved ? 'Comment (resolved)' : 'Comment'}</Text>
                </Pressable>
              </View>
            ) : null}
            {s?.photo ? (
              // A selected photo: its layout and size first.
              <View style={styles.linkChips}>
                <Pressable onPress={onPhotoLayout} style={styles.linkChip} accessibilityRole="button" accessibilityLabel="Photo layout">
                  <Text style={styles.linkChipText}>Layout</Text>
                </Pressable>
                {[
                  { label: 'Small', width: PHOTO_WIDTHS.small },
                  { label: 'Medium', width: PHOTO_WIDTHS.medium },
                  { label: 'Large', width: PHOTO_WIDTHS.large },
                  { label: 'Full width', width: PHOTO_WIDTHS.full },
                ].map((a) => (
                  <Pressable
                    key={a.label}
                    onPress={() => run({ type: 'photoWidth', width: a.width })}
                    style={[styles.linkChip, s.photo?.width === a.width && styles.chipOn]}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo size ${a.label.toLowerCase()}`}
                    accessibilityState={{ selected: s.photo?.width === a.width }}
                  >
                    <Text style={[styles.linkChipText, s.photo?.width === a.width && styles.chipOnText]}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      )}
      <View style={styles.bar}>
        <View style={styles.tools} onLayout={(e) => setRoom(Math.floor(e.nativeEvent.layout.width) - TOOLS_PADDING)}>
          {fits.map((t) => t.node)}
          {overflow.length > 0 && button(more ? 'Fewer tools' : 'More tools', more ? 'chevron-down' : 'chevron-up', () => setMore(!more), { active: more })}
        </View>
        <Pressable onPress={onDone} style={styles.done} accessibilityRole="button" accessibilityLabel="Hide keyboard">
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
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
    tools: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: TOOLS_PADDING / 2, overflow: 'hidden' },
    moreRow: { backgroundColor: c.cardMuted },
    wrapRow: { height: undefined, minHeight: 48, flexWrap: 'wrap', paddingHorizontal: 4 },
    chipRow: { backgroundColor: c.card },
    button: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    aa: { width: 48 },
    aaText: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    active: { backgroundColor: c.accentLight },
    disabled: { opacity: 0.35 },
    linkChips: { flexDirection: 'row', gap: 4, marginRight: 6 },
    linkChip: { height: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: c.accentLight },
    linkChipText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    chipOn: { backgroundColor: c.accentDark },
    chipOnText: { color: c.accentOn },
    done: {
      height: 48,
      paddingHorizontal: 14,
      justifyContent: 'center',
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: c.border,
    },
    doneText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.accentDark },
  });
