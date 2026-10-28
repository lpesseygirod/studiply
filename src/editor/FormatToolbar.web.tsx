import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Editor } from '@tiptap/react';

import { anchorBelow, showAlert, type Anchor } from '../components/dialogs/dialogs';
import { ColorGrid } from '../components/editor/ColorGrid';
import { SpectrumPicker } from '../components/editor/SpectrumPicker';
import { ToolbarPopover } from '../components/editor/ToolbarPopover';
import { useRecentColours } from '../services/preferences.service';
import type { ThemeColors } from '../constants/colors';
import { Layout } from '../constants/layout';
import { Typography } from '../constants/typography';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { PAGE_COLORS } from './editorCss';
import { LINK_EVENT } from './bridges/format';
import { ALIGNS, formatState, runFormat, TEXT_STYLES, type Align, type FormatCommand, type TextStyleKey } from './format';
import { TableGrid } from '../components/editor/TableGrid';
import { TableSizeForm } from '../components/editor/TableSizeForm';
import { useToolbarExpanded } from '../lib/toolbarPrefs';
import { LinkForm } from '../components/editor/LinkForm';
import { LINE_SPACINGS } from './schema/blocks';
import { cleanSize, FONTS } from './schema/fonts';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Menu = 'style' | 'font' | 'color' | 'highlight' | 'spacing' | 'link' | 'table';

/** A toolbar item and the width it takes (for deciding what fits on the first row). */
interface Item {
  key: string;
  width: number;
  node: React.ReactNode;
  gap?: boolean;
}
const TOOL_W = 34;
const GAP_W = 13;
const ROW_PADDING = 24;

/** The first items that fit in `room`, in order; the rest overflow (into the ⌄ row). */
export function splitRow<T extends { width: number }>(items: T[], room: number): { fits: T[]; overflow: T[] } {
  let used = 0;
  let cut = items.length;
  for (let i = 0; i < items.length; i++) {
    used += items[i].width;
    if (used > room) {
      cut = i;
      break;
    }
  }
  return { fits: items.slice(0, cut), overflow: items.slice(cut) };
}

/** No separator at either end of a row, nor two in a row. */
function trimGaps(items: Item[]): Item[] {
  const out = items.filter((item, i) => !item.gap || (i > 0 && !items[i - 1].gap));
  while (out[0]?.gap) out.shift();
  while (out[out.length - 1]?.gap) out.pop();
  return out;
}

const ALIGN_ICON: Record<Align, IconName> = {
  left: 'format-align-left',
  center: 'format-align-center',
  right: 'format-align-right',
  justify: 'format-align-justify',
};
const SPACING_LABEL: Record<number, string> = { 1: 'Single', 1.15: '1.15', 1.5: '1.5', 2: 'Double' };

/** How each style looks in the style menu (on the menu's card, which follows the appearance). */
const STYLE_LOOK: Record<TextStyleKey, object> = {
  title: { fontSize: 22, fontWeight: Typography.weight.bold },
  h1: { fontSize: 19, fontWeight: Typography.weight.bold },
  h2: { fontSize: 16.5, fontWeight: Typography.weight.bold },
  subheading: { fontSize: 15, fontWeight: Typography.weight.semibold },
  normal: { fontSize: 14 },
  quote: { fontSize: 14, fontStyle: 'italic' },
};

/**
 * The laptop's formatting toolbar (steps 4.4, 4.5; docs/design desktop-01).
 * One row of the most-used tools (undo, redo · style · font · size · B I U ·
 * colours · lists · link, image, table) and
 * ⌄ for a second row with the rest (align, line spacing, indent, page break,
 * clear formatting, formula, comment, strikethrough, checklist); open or
 * closed is remembered on this device, and what doesn't fit a narrow
 * window moves into the second row (Lea). Shows
 * what is active where the selection is (formatState) and runs the shared
 * commands (src/editor/format); the shortcuts are listed in the "?" sheet.
 */
export function FormatToolbar({ editor, onImage }: { editor: Editor; /** Photos from the browser's file picker. */ onImage?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const s = formatState(editor);
  const [menu, setMenu] = useState<{ kind: Menu; anchor: Anchor } | null>(null);
  const [spectrum, setSpectrum] = useState(false);
  const recent = useRecentColours();
  const [expanded, setExpanded] = useToolbarExpanded('laptop');
  const [width, setWidth] = useState(1200);
  // Each tool's real width once it has been shown (in either row); until then its estimate.
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const refs = useRef<Partial<Record<Menu, View | null>>>({});
  const toolbarRef = useRef<View>(null);
  const [sizeText, setSizeText] = useState(String(s.size));
  const sizeFocused = useRef(false);

  // ⌘K in the text, and Edit in the link bubble, open the link dialog.
  useEffect(() => {
    const dom = editor.view.dom;
    const onLink = () => void open('link');
    dom.addEventListener(LINK_EVENT, onLink);
    return () => dom.removeEventListener(LINK_EVENT, onLink);
  });

  useEffect(() => {
    if (!sizeFocused.current) setSizeText(String(s.size));
  }, [s.size]);

  const run = (cmd: FormatCommand) => {
    setMenu(null);
    setSpectrum(false);
    runFormat(editor, cmd);
  };
  const open = async (kind: Menu) => {
    // A tool that moved into the closed second row (⌘K for Link) opens under the toolbar.
    const anchor = (await anchorBelow({ current: refs.current[kind] ?? null })) ?? (await anchorBelow(toolbarRef));
    if (anchor) setMenu({ kind, anchor });
  };
  const close = () => {
    setMenu(null);
    setSpectrum(false);
  };

  const tool = (label: string, icon: IconName, cmd: FormatCommand, { active = false, disabled = false } = {}) => (
    <Pressable
      key={label}
      onPress={() => run(cmd)}
      disabled={disabled}
      style={({ hovered }: { hovered?: boolean }) => [styles.tool, hovered && !disabled && styles.toolHover, active && styles.toolActive, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
    >
      <MaterialCommunityIcons name={icon} size={20} color={active ? c.accentDark : c.text.primary} />
    </Pressable>
  );

  const dropdown = (kind: Menu, label: string, text: string, width: number, textStyle?: object) => (
    <View ref={(v) => void (refs.current[kind] = v)} collapsable={false}>
      <Pressable
        onPress={() => open(kind)}
        style={({ hovered }: { hovered?: boolean }) => [styles.dropdown, { width }, hovered && styles.toolHover]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.dropdownText, textStyle]} numberOfLines={1}>
          {text}
        </Text>
        <MaterialCommunityIcons name="menu-down" size={18} color={c.text.secondary} />
      </Pressable>
    </View>
  );

  const swatchButton = (kind: 'color' | 'highlight', label: string, icon: IconName, swatch: string) => (
    <View ref={(v) => void (refs.current[kind] = v)} collapsable={false}>
      <Pressable
        onPress={() => open(kind)}
        style={({ hovered }: { hovered?: boolean }) => [styles.tool, hovered && styles.toolHover]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <MaterialCommunityIcons name={icon} size={18} color={c.text.primary} />
        <View style={[styles.swatchBar, { backgroundColor: swatch }]} />
      </Pressable>
    </View>
  );

  const iconMenu = (kind: 'spacing', label: string, icon: IconName) => (
    <View ref={(v) => void (refs.current[kind] = v)} collapsable={false}>
      <Pressable
        onPress={() => open(kind)}
        style={({ hovered }: { hovered?: boolean }) => [styles.tool, styles.toolWide, hovered && styles.toolHover]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <MaterialCommunityIcons name={icon} size={20} color={c.text.primary} />
        <MaterialCommunityIcons name="menu-down" size={14} color={c.text.secondary} />
      </Pressable>
    </View>
  );

  const row = (key: string, children: React.ReactNode, onPress: () => void, checked: boolean, hint?: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean }) => [styles.menuRow, hovered && styles.toolHover]}
      accessibilityRole="menuitem"
      accessibilityState={{ checked }}
    >
      <View style={styles.check}>{checked && <MaterialCommunityIcons name="check" size={16} color={c.accentDark} />}</View>
      <View style={styles.flex}>{children}</View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Pressable>
  );

  // The colour picker (step 4.5): the grid, or the spectrum after More colours…
  const chooser = (kind: 'color' | 'highlight') => {
    const current = kind === 'color' ? s.color : s.highlight && s.highlight !== 'default' ? s.highlight : null;
    const pick = (colour: string | null) => {
      if (colour) recent.add(colour);
      setSpectrum(false);
      run(kind === 'color' ? { type: 'color', color: colour } : { type: 'highlight', color: colour });
    };
    return spectrum ? (
      <SpectrumPicker initial={current} showHex onDone={pick} onCancel={() => setSpectrum(false)} width={236} />
    ) : (
      <ColorGrid
        value={current}
        noneLabel={kind === 'color' ? 'Automatic' : 'None'}
        recent={recent.recent}
        onPick={pick}
        onMore={() => setSpectrum(true)}
        kind={kind === 'color' ? 'Text colour' : 'Highlight'}
      />
    );
  };

  const styleLabel = TEXT_STYLES.find((t) => t.key === s.style)?.label ?? 'Normal text';
  const font = FONTS.find((f) => f.key === s.font) ?? FONTS[0];
  const soon = (what: string) => () => showAlert(what, 'Coming in the next update.');
  const iconButton = (kind: Menu, label: string, icon: IconName, active = false) => (
    <View ref={(v) => void (refs.current[kind] = v)} collapsable={false}>
      <Pressable
        onPress={() => open(kind)}
        style={({ hovered }: { hovered?: boolean }) => [styles.tool, hovered && styles.toolHover, active && styles.toolActive]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <MaterialCommunityIcons name={icon} size={20} color={active ? c.accentDark : c.text.primary} />
      </Pressable>
    </View>
  );
  const plain = (label: string, icon: IconName, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean }) => [styles.tool, hovered && styles.toolHover]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={20} color={c.text.primary} />
    </Pressable>
  );
  const gap = (key: string): Item => ({ key, width: GAP_W, node: <View style={styles.gap} />, gap: true });
  const t = (key: string, node: React.ReactNode, width = TOOL_W): Item => ({ key, width, node });

  // Lea (step 4.5): the most-used tools on one row, in this order; the rest
  // behind ⌄. Tools that don't fit a narrow window move into the ⌄ row.
  const primary: Item[] = [
    t('undo', tool('Undo', 'undo', { type: 'undo' }, { disabled: !s.canUndo })),
    t('redo', tool('Redo', 'redo', { type: 'redo' }, { disabled: !s.canRedo })),
    gap('g1'),
    t('style', dropdown('style', 'Text style', styleLabel, 118), 124),
    t('font', dropdown('font', 'Font', font.label, 100, font.css ? { fontFamily: font.css } : undefined), 106),
    t(
      'size',
      <View style={styles.size}>
        {tool('Smaller', 'minus', { type: 'sizeStep', direction: -1 })}
        <TextInput
          value={sizeText}
          onChangeText={setSizeText}
          onFocus={() => (sizeFocused.current = true)}
          onBlur={() => {
            sizeFocused.current = false;
            const n = cleanSize(sizeText);
            if (n && n !== s.size) runFormat(editor, { type: 'size', size: n });
            else setSizeText(String(s.size));
          }}
          onSubmitEditing={() => {
            const n = cleanSize(sizeText);
            if (n) runFormat(editor, { type: 'size', size: n });
          }}
          style={styles.sizeBox}
          accessibilityLabel="Font size"
          inputMode="numeric"
          selectTextOnFocus
        />
        {tool('Bigger', 'plus', { type: 'sizeStep', direction: 1 })}
      </View>,
      108,
    ),
    gap('g2'),
    t('bold', tool('Bold', 'format-bold', { type: 'mark', mark: 'bold' }, { active: s.bold })),
    t('italic', tool('Italic', 'format-italic', { type: 'mark', mark: 'italic' }, { active: s.italic })),
    t('underline', tool('Underline', 'format-underline', { type: 'mark', mark: 'underline' }, { active: s.underline })),
    t('color', swatchButton('color', 'Text colour', 'format-color-text', s.color ?? PAGE_COLORS.text.primary)),
    t('highlight', swatchButton('highlight', 'Highlight', 'marker', s.highlight && s.highlight !== 'default' ? s.highlight : c.border)),
    gap('g3'),
    t('bullet', tool('Bulleted list', 'format-list-bulleted', { type: 'list', list: 'bullet' }, { active: s.list === 'bullet' })),
    t('ordered', tool('Numbered list', 'format-list-numbered', { type: 'list', list: 'ordered' }, { active: s.list === 'ordered' })),
    gap('g4'),
    t('link', iconButton('link', 'Link (⌘K)', 'link-variant', !!s.link)),
    t('image', plain('Image', 'image-outline', onImage ?? soon('Images'))),
    t('table', iconButton('table', 'Insert table', 'table-large-plus')),
  ];
  const secondary: Item[] = [
    ...ALIGNS.map((a) => t(`align-${a.key}`, tool(`Align ${a.label.toLowerCase()} (${a.shortcut})`, ALIGN_ICON[a.key], { type: 'align', align: a.key }, { active: s.align === a.key }))),
    gap('g5'),
    t('spacing', iconMenu('spacing', 'Line spacing', 'format-line-spacing'), 40),
    t('outdent', tool('Decrease indent', 'format-indent-decrease', { type: 'outdent' }, { disabled: !s.canOutdent })),
    t('indent', tool('Increase indent', 'format-indent-increase', { type: 'indent' }, { disabled: !s.canIndent })),
    gap('g6'),
    t('pageBreak', tool('Page break', 'format-page-break', { type: 'pageBreak' })),
    t('clear', tool('Clear formatting', 'format-clear', { type: 'clear' })),
    gap('g7'),
    t('formula', plain('Formula', 'sigma', soon('Formulas'))),
    t('comment', plain('Comment', 'comment-plus-outline', soon('Comments'))),
    gap('g8'),
    t('strike', tool('Strikethrough', 'format-strikethrough-variant', { type: 'mark', mark: 'strike' }, { active: s.strike })),
    t('checklist', tool('Checklist', 'format-list-checks', { type: 'list', list: 'task' }, { active: s.list === 'task' })),
  ];
  const measuredItem = (i: Item) => (
    <View
      key={i.key}
      onLayout={(e) => {
        const w = Math.ceil(e.nativeEvent.layout.width) + 2;
        setMeasured((m) => (m[i.key] === w ? m : { ...m, [i.key]: w }));
      }}
    >
      {i.node}
    </View>
  );
  const sized = primary.map((i) => ({ ...i, width: measured[i.key] ?? i.width }));
  const { fits, overflow } = splitRow(sized, width - ROW_PADDING - TOOL_W);
  const second = [...overflow, ...(overflow.length ? [gap('g0')] : []), ...secondary];
  const showSecond = expanded;

  return (
    <View ref={toolbarRef} style={styles.toolbar} accessibilityRole="toolbar" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.row}>
        {trimGaps(fits).map(measuredItem)}
        <View style={styles.flex} />
        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={({ hovered }: { hovered?: boolean }) => [styles.tool, hovered && styles.toolHover, expanded && styles.toolActive]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Fewer tools' : 'More tools'}
          accessibilityState={{ expanded }}
        >
          <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={expanded ? c.accentDark : c.text.primary} />
        </Pressable>
      </View>
      {showSecond && (
        <View style={[styles.row, styles.secondRow]}>
          {trimGaps(second).map(measuredItem)}
        </View>
      )}

      <ToolbarPopover anchor={menu?.kind === 'style' ? menu.anchor : null} onClose={close} width={250} label="Text style">
        {TEXT_STYLES.map((t) =>
          row(t.key, <Text style={[styles.menuText, STYLE_LOOK[t.key]]}>{t.label}</Text>, () => run({ type: 'style', style: t.key }), t.key === s.style, t.shortcut),
        )}
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'font' ? menu.anchor : null} onClose={close} width={200} label="Font">
        {FONTS.map((f) =>
          row(f.key, <Text style={[styles.menuText, f.css ? { fontFamily: f.css } : null]}>{f.label}</Text>, () => run({ type: 'font', font: f.key }), f.key === s.font),
        )}
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'link' ? menu.anchor : null} onClose={close} width={300} label="Link">
        <LinkForm
          current={s.link}
          askText={editor.state.selection.empty && !s.link}
          onApply={(href, text) => run({ type: 'link', href, text })}
          onRemove={() => run({ type: 'link', href: null })}
          onCancel={close}
        />
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'table' ? menu.anchor : null} onClose={close} width={280} label="Insert table">
        <TableGrid onPick={(rows, cols) => run({ type: 'table', action: 'insert', rows, cols })} />
        <View style={styles.menuDivider} />
        <TableSizeForm rows={3} cols={3} action="Insert" onSubmit={(rows, cols) => run({ type: 'table', action: 'insert', rows, cols })} />
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'spacing' ? menu.anchor : null} onClose={close} width={170} label="Line spacing">
        {LINE_SPACINGS.map((v) =>
          row(String(v), <Text style={styles.menuText}>{SPACING_LABEL[v]}</Text>, () => run({ type: 'lineSpacing', spacing: v }), v === s.lineSpacing),
        )}
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'color' ? menu.anchor : null} onClose={close} width={260} label="Text colour">
        <View style={styles.picker}>{chooser('color')}</View>
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'highlight' ? menu.anchor : null} onClose={close} width={260} label="Highlight">
        <View style={styles.picker}>{chooser('highlight')}</View>
      </ToolbarPopover>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    // The toolbar follows the app's appearance; the page stays white (editorCss).
    toolbar: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 4,
      borderRadius: Layout.cardRadius.laptop,
      backgroundColor: c.card,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    secondRow: { flexWrap: 'wrap', paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    gap: { width: 1, height: 20, marginHorizontal: 6, backgroundColor: c.border },
    menuDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4, marginHorizontal: 10, backgroundColor: c.border },
    tool: { minWidth: 32, height: 32, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    toolWide: { flexDirection: 'row', paddingHorizontal: 2 },
    toolHover: { backgroundColor: c.cardMuted },
    toolActive: { backgroundColor: c.accentLight },
    disabled: { opacity: 0.35 },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 32,
      paddingLeft: 10,
      paddingRight: 4,
      marginHorizontal: 2,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    dropdownText: { flexShrink: 1, fontSize: Typography.size.sm, color: c.text.primary },
    size: { flexDirection: 'row', alignItems: 'center' },
    sizeBox: {
      width: 38,
      height: 28,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.border,
      textAlign: 'center',
      fontSize: Typography.size.sm,
      color: c.text.primary,
      outlineStyle: 'none' as never,
    },
    swatchBar: { position: 'absolute', left: 8, right: 8, bottom: 4, height: 3, borderRadius: 1.5 },
    menuRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingHorizontal: 10, marginHorizontal: 4, borderRadius: 8 },
    rowInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    check: { width: 22 },
    menuText: { fontSize: Typography.size.base, color: c.text.primary },
    hint: { fontSize: Typography.size.xs, color: c.text.secondary, marginLeft: 8 },
    picker: { paddingHorizontal: 12, paddingVertical: 6 },
  });
