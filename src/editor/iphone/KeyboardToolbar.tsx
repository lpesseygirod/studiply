import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useKeyboardAccessory } from './keyboardAccessory';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { FormatCommand, FormatState } from '../format';
import { PHOTO_WIDTHS } from '../schema/photo';
import type { CommentInfo } from '../schema/comments';
import { useToolbarExpanded } from '../../lib/toolbarPrefs';
import { splitRow } from '../toolbarFit';
import { TOOLS, toolCaption, type ToolKey } from '../toolNames';

const TOOL_W = 44;
const AA_W = 48;
const TOOLS_PADDING = 8;
const SEPARATOR_W = 1;
const HINT_MS = 1500;
const HINT_PRESS_MS = 350;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type Panel = 'aa' | 'colors' | 'newTable' | 'table';

/** What goes into the document from the second row (Lea, after test C: no "+" panel). */
export interface InsertActions {
  /** From Photos (several) or the camera; null when photos can't be added here. */
  photos: ((from: 'library' | 'camera') => void) | null;
  /** Rows and columns, in place of the keyboard. */
  table: () => void;
  formula: () => void;
  /** A comment on the selected words. */
  comment: () => void;
  /** Studiply's blocks (step 4.6): a callout (its kind), a mark chip, a timestamp typed in. */
  callout: () => void;
  mark: () => void;
  timestamp: () => void;
  /** A graph (step 4.7d): put one in and open its sheet. */
  graph: () => void;
}

/**
 * The iPhone's keyboard toolbar (steps 4.4, 4.5), like the laptop's (Lea,
 * test B): one row of tools in the laptop's order (Aa · B I U · colours ·
 * lists · link · Table in a table · then strikethrough, checklist,
 * indent, undo, redo), never scrolling: what doesn't fit this iPhone's width
 * goes to a second row above, opened with the arrow at the right (open or
 * closed is remembered on this iPhone), with Done at the end. The second
 * row always ends with what goes into the document: Photo, Take photo,
 * Table, Formula, Comment (Lea, after test C: no "+" panel, all at once).
 * What to do with the link, comment, photo or maths at the cursor comes on
 * a row of its own above the tools. Aa, the colours, a new table and Table
 * open their panels in place of the keyboard. A keyboard accessory, so the
 * caret stays above.
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
  insert,
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
  insert: InsertActions;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const accessory = useKeyboardAccessory(true);
  const [more, setMore] = useToolbarExpanded('iphone');
  const [room, setRoom] = useState(320);
  // A long press shows the tool's name for a moment, over the toolbar (the simplicity pass).
  const [hint, setHint] = useState<{ text: string; x: number } | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (hintTimer.current && clearTimeout(hintTimer.current)), []);
  const showHint = (text: string, e: GestureResponderEvent) => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint({ text, x: e.nativeEvent.pageX });
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  };
  const s = state;

  const tools: Tool[] = [
    { key: 'textStyle', group: 'text', width: AA_W, text: 'Aa', onPress: () => onPanel('aa'), active: panel === 'aa' },
    { key: 'bold', group: 'format', icon: 'format-bold', onPress: () => run({ type: 'mark', mark: 'bold' }), active: !!s?.bold },
    { key: 'italic', group: 'format', icon: 'format-italic', onPress: () => run({ type: 'mark', mark: 'italic' }), active: !!s?.italic },
    { key: 'underline', group: 'format', icon: 'format-underline', onPress: () => run({ type: 'mark', mark: 'underline' }), active: !!s?.underline },
    { key: 'colours', group: 'format', icon: 'palette-outline', onPress: () => onPanel('colors'), active: panel === 'colors' },
    { key: 'bullet', group: 'paragraph', icon: 'format-list-bulleted', onPress: () => run({ type: 'list', list: 'bullet' }), active: s?.list === 'bullet' },
    { key: 'ordered', group: 'paragraph', icon: 'format-list-numbered', onPress: () => run({ type: 'list', list: 'ordered' }), active: s?.list === 'ordered' },
    { key: 'link', group: 'insert', icon: 'link-variant', onPress: onLink, active: !!s?.link },
    ...(s?.inTable ? [{ key: 'table' as const, group: 'insert' as const, icon: 'table-edit' as IconName, onPress: () => onPanel('table'), active: panel === 'table', label: 'Table options' }] : []),
  ];
  // Always in the second row: what is rarely used, and what goes into the document.
  const rest: Tool[] = [
    { key: 'strike', group: 'format', icon: 'format-strikethrough-variant', onPress: () => run({ type: 'mark', mark: 'strike' }), active: !!s?.strike },
    { key: 'task', group: 'paragraph', icon: 'format-list-checks', onPress: () => run({ type: 'list', list: 'task' }), active: s?.list === 'task' },
    { key: 'outdent', group: 'paragraph', icon: 'format-indent-decrease', onPress: () => run({ type: 'outdent' }), disabled: s ? !s.canOutdent : false },
    { key: 'indent', group: 'paragraph', icon: 'format-indent-increase', onPress: () => run({ type: 'indent' }), disabled: s ? !s.canIndent : false },
    ...(insert.photos
      ? [
          { key: 'image' as const, group: 'insert' as const, icon: 'image-outline' as IconName, onPress: () => insert.photos?.('library'), label: 'Insert photo' },
          { key: 'camera' as const, group: 'insert' as const, icon: 'camera-outline' as IconName, onPress: () => insert.photos?.('camera') },
        ]
      : []),
    { key: 'table', group: 'insert', icon: 'table-large-plus', onPress: insert.table, active: panel === 'newTable', label: 'Insert table' },
    { key: 'formula', group: 'insert', icon: 'sigma', onPress: insert.formula, label: 'Insert formula' },
    { key: 'graph', group: 'insert', icon: 'chart-bar', onPress: insert.graph, label: 'Insert graph' },
    { key: 'comment', group: 'insert', icon: 'comment-plus-outline', onPress: insert.comment, label: 'Add comment' },
    { key: 'callout', group: 'insert', icon: 'card-text-outline', onPress: insert.callout, label: 'Insert callout' },
    { key: 'mark', group: 'insert', icon: 'flag-outline', onPress: insert.mark, label: 'Insert mark' },
    { key: 'timestamp', group: 'insert', icon: 'clock-outline', onPress: insert.timestamp, label: 'Insert timestamp' },
    { key: 'undo', group: 'edit', icon: 'undo', onPress: () => run({ type: 'undo' }), disabled: s ? !s.canUndo : false },
    { key: 'redo', group: 'edit', icon: 'redo', onPress: () => run({ type: 'redo' }), disabled: s ? !s.canRedo : false },
  ];

  // The first row: what fits, with a thin line between groups; the arrow is always there (the second row always has something).
  const row = withSeparators(tools);
  const { fits, overflow } = splitRow(row, room - TOOL_W);
  const first = trimSeparators(fits);
  const moved = overflow.flatMap((t) => ('separator' in t ? [] : [t as Tool]));
  const second = GROUPS.map((g) => ({ ...g, tools: [...moved, ...rest].filter((t) => t.group === g.key) })).filter((g) => g.tools.length > 0);
  const hasChips = !!(s?.link || s?.mathSuggestion || s?.comment || s?.photo);

  /** A button of the first row: icon (or "Aa"), its name on a long press. */
  const button = (t: Tool) => (
    <Pressable
      key={`${t.group}-${t.key}`}
      onPress={t.onPress}
      onLongPress={(e) => showHint(TOOLS[t.key].name, e)}
      delayLongPress={HINT_PRESS_MS}
      disabled={t.disabled}
      style={[styles.button, t.width === AA_W && styles.aa, t.active && styles.active, t.disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={t.label ?? TOOLS[t.key].name}
      accessibilityState={{ selected: !!t.active, disabled: !!t.disabled }}
    >
      {t.text ? (
        <Text style={[styles.aaText, t.active && { color: c.accentDark }]}>{t.text}</Text>
      ) : (
        <MaterialCommunityIcons name={t.icon!} size={22} color={t.active ? c.accentDark : c.text.primary} />
      )}
    </Pressable>
  );
  /** A button of the second row: icon and its name under it. */
  const captioned = (t: Tool) => (
    <Pressable
      key={`${t.group}-${t.key}`}
      onPress={t.onPress}
      disabled={t.disabled}
      style={[styles.captioned, t.active && styles.active, t.disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={t.label ?? TOOLS[t.key].name}
      accessibilityState={{ selected: !!t.active, disabled: !!t.disabled }}
    >
      {t.text ? (
        <Text style={[styles.aaText, t.active && { color: c.accentDark }]}>{t.text}</Text>
      ) : (
        <MaterialCommunityIcons name={t.icon!} size={22} color={t.active ? c.accentDark : c.text.primary} />
      )}
      <Text style={[styles.caption, t.active && { color: c.accentDark }]} numberOfLines={1}>
        {toolCaption(t.key)}
      </Text>
    </Pressable>
  );
  const arrow: Tool = { key: more ? 'fewer' : 'more', group: 'edit', icon: more ? 'chevron-down' : 'chevron-up', onPress: () => setMore(!more), active: more };

  return (
    <View onLayout={accessory.onLayout}>
      {/* The second row: labelled groups, each tool named under its icon (open or closed is remembered on this iPhone). */}
      {more && (
        <View style={[styles.bar, styles.moreRow, styles.wrapRow]}>
          {second.map((g) => (
            <View key={g.key} style={styles.group}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              <View style={styles.groupTools}>{g.tools.map(captioned)}</View>
            </View>
          ))}
        </View>
      )}
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
          {first.map((t) => ('separator' in t ? <View key={t.key} style={styles.separator} /> : button(t)))}
          {button(arrow)}
        </View>
        <Pressable onPress={onDone} style={styles.done} accessibilityRole="button" accessibilityLabel={TOOLS.done.name}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
      {hint && (
        <View pointerEvents="none" style={[styles.hint, { left: Math.max(8, hint.x - 60) }]}>
          <Text style={styles.hintText}>{hint.text}</Text>
        </View>
      )}
    </View>
  );
}

type Group = 'text' | 'format' | 'paragraph' | 'insert' | 'edit';
const GROUPS: { key: Group; title: string }[] = [
  { key: 'text', title: 'Text' },
  { key: 'format', title: 'Format' },
  { key: 'paragraph', title: 'Paragraph' },
  { key: 'insert', title: 'Insert' },
  { key: 'edit', title: 'Edit' },
];
interface Tool {
  key: ToolKey;
  group: Group;
  icon?: IconName;
  text?: string;
  width?: number;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  /** For VoiceOver when it says more than the name ("Insert table"). */
  label?: string;
}
type RowItem = (Tool & { width: number }) | { key: string; separator: true; width: number };

/** The tools with a thin line wherever the group changes. */
function withSeparators(tools: Tool[]): RowItem[] {
  const out: RowItem[] = [];
  tools.forEach((t, i) => {
    if (i > 0 && tools[i - 1].group !== t.group) out.push({ key: `sep-${i}`, separator: true, width: SEPARATOR_W });
    out.push({ ...t, width: t.width ?? TOOL_W });
  });
  return out;
}
/** No line at the end of a row. */
function trimSeparators(items: RowItem[]): RowItem[] {
  const out = [...items];
  while (out.length && 'separator' in out[out.length - 1]) out.pop();
  return out;
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
    // 'auto', not undefined: the web drops an undefined height (the preview page).
    wrapRow: { height: 'auto', minHeight: 48, flexWrap: 'wrap', alignItems: 'flex-start', paddingHorizontal: 6, paddingVertical: 6, rowGap: 6, columnGap: 10 },
    group: { gap: 2, maxWidth: '100%' },
    groupTitle: { marginLeft: 4, fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    groupTools: { flexDirection: 'row', flexWrap: 'wrap' },
    captioned: { width: 58, minHeight: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4 },
    caption: { fontSize: 10, color: c.text.secondary },
    separator: { width: 1, height: 24, backgroundColor: c.border },
    hint: { position: 'absolute', bottom: '100%', marginBottom: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: c.text.primary },
    hintText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.card },
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
