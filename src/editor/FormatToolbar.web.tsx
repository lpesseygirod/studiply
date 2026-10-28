import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Editor } from '@tiptap/react';

import { anchorBelow, type Anchor } from '../components/dialogs/dialogs';
import { ColorGrid } from '../components/editor/ColorGrid';
import { SpectrumPicker } from '../components/editor/SpectrumPicker';
import { ToolbarPopover } from '../components/editor/ToolbarPopover';
import { useRecentColours } from '../services/preferences.service';
import type { ThemeColors } from '../constants/colors';
import { Layout } from '../constants/layout';
import { Typography } from '../constants/typography';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { PAGE_COLORS } from './editorCss';
import { ALIGNS, formatState, runFormat, TEXT_STYLES, type Align, type FormatCommand, type TextStyleKey } from './format';
import { LINE_SPACINGS } from './schema/blocks';
import { cleanSize, FONTS } from './schema/fonts';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Menu = 'style' | 'font' | 'color' | 'highlight' | 'spacing';

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
 * The laptop's formatting toolbar (step 4.4, docs/design desktop-01): undo,
 * redo · style · font · − size + · B I U S · text colour · highlight · lists
 * · left, centre, right, justify (always visible) · line spacing · indent − + ·
 * page break · clear formatting. Shows
 * what is active where the selection is (formatState) and runs the shared
 * commands (src/editor/format); the shortcuts are listed in the "?" sheet.
 */
export function FormatToolbar({ editor }: { editor: Editor }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const s = formatState(editor);
  const [menu, setMenu] = useState<{ kind: Menu; anchor: Anchor } | null>(null);
  const [spectrum, setSpectrum] = useState(false);
  const recent = useRecentColours();
  const refs = useRef<Partial<Record<Menu, View | null>>>({});
  const [sizeText, setSizeText] = useState(String(s.size));
  const sizeFocused = useRef(false);

  useEffect(() => {
    if (!sizeFocused.current) setSizeText(String(s.size));
  }, [s.size]);

  const run = (cmd: FormatCommand) => {
    setMenu(null);
    setSpectrum(false);
    runFormat(editor, cmd);
  };
  const open = async (kind: Menu) => {
    const anchor = await anchorBelow({ current: refs.current[kind] ?? null });
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

  return (
    <View style={styles.toolbar} accessibilityRole="toolbar">
      {tool('Undo', 'undo', { type: 'undo' }, { disabled: !s.canUndo })}
      {tool('Redo', 'redo', { type: 'redo' }, { disabled: !s.canRedo })}
      <View style={styles.gap} />
      {dropdown('style', 'Text style', styleLabel, 128)}
      {dropdown('font', 'Font', font.label, 112, font.css ? { fontFamily: font.css } : undefined)}
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
      </View>
      <View style={styles.gap} />
      {tool('Bold', 'format-bold', { type: 'mark', mark: 'bold' }, { active: s.bold })}
      {tool('Italic', 'format-italic', { type: 'mark', mark: 'italic' }, { active: s.italic })}
      {tool('Underline', 'format-underline', { type: 'mark', mark: 'underline' }, { active: s.underline })}
      {tool('Strikethrough', 'format-strikethrough-variant', { type: 'mark', mark: 'strike' }, { active: s.strike })}
      {swatchButton('color', 'Text colour', 'format-color-text', s.color ?? PAGE_COLORS.text.primary)}
      {swatchButton('highlight', 'Highlight', 'marker', s.highlight && s.highlight !== 'default' ? s.highlight : c.border)}
      <View style={styles.gap} />
      {tool('Bulleted list', 'format-list-bulleted', { type: 'list', list: 'bullet' }, { active: s.list === 'bullet' })}
      {tool('Numbered list', 'format-list-numbered', { type: 'list', list: 'ordered' }, { active: s.list === 'ordered' })}
      {tool('Checklist', 'format-list-checks', { type: 'list', list: 'task' }, { active: s.list === 'task' })}
      <View style={styles.gap} />
      {ALIGNS.map((a) => tool(`Align ${a.label.toLowerCase()} (${a.shortcut})`, ALIGN_ICON[a.key], { type: 'align', align: a.key }, { active: s.align === a.key }))}
      <View style={styles.gap} />
      {iconMenu('spacing', 'Line spacing', 'format-line-spacing')}
      {tool('Decrease indent', 'format-indent-decrease', { type: 'outdent' }, { disabled: !s.canOutdent })}
      {tool('Increase indent', 'format-indent-increase', { type: 'indent' }, { disabled: !s.canIndent })}
      <View style={styles.gap} />
      {tool('Page break', 'format-page-break', { type: 'pageBreak' })}
      {tool('Clear formatting', 'format-clear', { type: 'clear' })}

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
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: Layout.cardRadius.laptop,
      backgroundColor: c.card,
    },
    gap: { width: 1, height: 20, marginHorizontal: 6, backgroundColor: c.border },
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
