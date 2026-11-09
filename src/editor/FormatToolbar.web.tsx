import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Editor } from '@tiptap/react';

import { anchorBelow, promptText, showAlert, type Anchor } from '../components/dialogs/dialogs';
import { CalloutKinds } from '../components/editor/CalloutKinds';
import { FormulaLibrary } from '../components/editor/FormulaLibrary';
import { MarkForm } from '../components/editor/MarkForm';
import { parseClock } from './schema/timestampChip';
import { ColorGrid } from '../components/editor/ColorGrid';
import { SpectrumPicker } from '../components/editor/SpectrumPicker';
import { ToolbarPopover } from '../components/editor/ToolbarPopover';
import { useRecentColours } from '../services/preferences.service';
import type { ThemeColors } from '../constants/colors';
import { Layout } from '../constants/layout';
import { Typography } from '../constants/typography';
import { a11yState } from '../utils/a11y';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { PAGE_COLORS } from './editorCss';
import { LINK_EVENT } from './bridges/format';
import { SELECTION_MENU_EVENT, type SelectionMenuDetail } from './format/selectionBar';
import { askGraphForm, selectedGraph } from './schema/graph';
import { FORMULA_EVENT } from './schema/formula';
import { splitRow } from './toolbarFit';
import { ALIGNS, formatState, runFormat, TEXT_STYLES, type Align, type FormatCommand, type TextStyleKey } from './format';
import { TableGrid } from '../components/editor/TableGrid';
import { TableSizeForm } from '../components/editor/TableSizeForm';
import { useToolbarExpanded } from '../lib/toolbarPrefs';
import { LinkForm } from '../components/editor/LinkForm';
import { LINE_SPACINGS } from './schema/blocks';
import { cleanSize, FONTS } from './schema/fonts';
import { TOOLS, toolTip, type ToolKey, type ToolName } from './toolNames';
import { ToolTip } from '../components/editor/ToolTip.web';
import { ZOOM_STEPS, type ViewPrefs, type ZoomSetting } from '../lib/viewPrefs';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Menu = 'style' | 'font' | 'color' | 'highlight' | 'spacing' | 'link' | 'table' | 'align' | 'insert' | 'view' | 'callout' | 'mark' | 'library';

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
const percent = (z: number) => `${Math.round(z * 100)} %`;
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
 * The laptop's formatting toolbar (steps 4.4, 4.5; the simplicity pass
 * before 4.6). One row in groups with separators: undo, redo · Text (style,
 * font, size) · Format (B I U, text colour, highlight) · Paragraph (lists,
 * Align ▾, Spacing ▾) · Insert ▾ (link, image, table, formula, comment, page
 * break) · View ▾ (Pages / Pageless, zoom); ⌄ opens a second row with what
 * is rarely used (strikethrough, Clear formatting, checklist, Indent − +),
 * after what didn't fit a narrow window. Every tool says its name and
 * shortcut on hover (toolNames.ts); menus have headings. Shows what is
 * active where the selection is (formatState) and runs the shared commands
 * (src/editor/format); the shortcuts are listed in the "?" sheet.
 */
export function FormatToolbar({
  editor,
  onImage,
  onComment,
  view,
}: {
  editor: Editor;
  /** Photos from the browser's file picker. */
  onImage?: () => void;
  /** A comment on the selected words. */
  onComment?: () => void;
  /** Pages or Pageless and the zoom (step 4.5b): the chosen ones, the zoom shown, and the setter. */
  view?: ViewPrefs & { shown: number; set: (change: Partial<ViewPrefs>) => void };
}) {
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

  // The selection bar's Callout ▸ / Mark ▸ / Time ▸ (after 4.6): the same menus as Insert ▾, under the button.
  useEffect(() => {
    const dom = editor.view.dom;
    const onMenu = (e: Event) => {
      const { button, x, y } = (e as CustomEvent<SelectionMenuDetail>).detail;
      if (button === 'time') void askTimestamp();
      else setMenu({ kind: button, anchor: { x, y } });
    };
    dom.addEventListener(SELECTION_MENU_EVENT, onMenu);
    return () => dom.removeEventListener(SELECTION_MENU_EVENT, onMenu);
  });

  useEffect(() => {
    if (!sizeFocused.current) setSizeText(String(s.size));
  }, [s.size]);

  const run = (cmd: FormatCommand) => {
    setMenu(null);
    setSpectrum(false);
    runFormat(editor, cmd);
  };
  const open = async (kind: Menu, under: Menu = kind) => {
    // A tool that moved into the closed second row (⌘K for Link) opens under the toolbar.
    const anchor = (await anchorBelow({ current: refs.current[under] ?? null })) ?? (await anchorBelow(toolbarRef));
    if (anchor) setMenu({ kind, anchor });
  };
  // ∑: the formula popover (FormulaPopover) opens under the toolbar, for a new formula or the selected one.
  const openFormula = async () => {
    const anchor = await anchorBelow(toolbarRef);
    if (anchor) editor.view.dom.dispatchEvent(new CustomEvent(FORMULA_EVENT, { detail: anchor }));
  };
  const close = () => {
    setMenu(null);
    setSpectrum(false);
  };
  // A graph (step 4.7d): an example to replace, its form open under it.
  const insertGraph = () => {
    if (!runFormat(editor, { type: 'graph', action: 'insert' })) return;
    const g = selectedGraph(editor.state);
    if (g) askGraphForm(editor.view, g.pos);
  };
  // A timestamp by hand (step 4.6): the time in the recording ("4:12").
  const askTimestamp = async () => {
    const text = await promptText('Timestamp', { message: 'The time in the recording, for example 4:12.', placeholder: '4:12', confirmLabel: 'Insert' });
    if (text === null) return;
    const ms = parseClock(text);
    if (ms === null) showAlert('Not a time', 'Type minutes and seconds, for example 4:12.');
    else runFormat(editor, { type: 'timestamp', ms });
  };

  /** A tool: its icon, its name on hover ("Bold ⌘B"), and its name for VoiceOver. */
  const tool = (key: ToolKey, icon: IconName, cmd: FormatCommand, { active = false, disabled = false } = {}) => (
    <ToolTip key={key} label={toolTip(key)}>
      <Pressable
        onPress={() => run(cmd)}
        disabled={disabled}
        style={({ hovered }: { hovered?: boolean }) => [styles.tool, hovered && !disabled && styles.toolHover, active && styles.toolActive, disabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={TOOLS[key].name}
        {...a11yState({ selected: active, disabled })}
      >
        <MaterialCommunityIcons name={icon} size={20} color={active ? c.accentDark : c.text.primary} />
      </Pressable>
    </ToolTip>
  );

  /** A menu button: words (and an icon) with ▾. */
  const dropdown = (kind: Menu, key: ToolKey, text: string, width: number, { textStyle, icon }: { textStyle?: object; icon?: IconName } = {}) => (
    <ToolTip label={toolTip(key)}>
      <View ref={(v) => void (refs.current[kind] = v)} collapsable={false}>
        <Pressable
          onPress={() => open(kind)}
          style={({ hovered }: { hovered?: boolean }) => [styles.dropdown, { width }, hovered && styles.toolHover]}
          accessibilityRole="button"
          accessibilityLabel={TOOLS[key].name}
        >
          {icon && <MaterialCommunityIcons name={icon} size={18} color={c.text.primary} />}
          <Text style={[styles.dropdownText, textStyle]} numberOfLines={1}>
            {text}
          </Text>
          <MaterialCommunityIcons name="menu-down" size={18} color={c.text.secondary} />
        </Pressable>
      </View>
    </ToolTip>
  );

  const swatchButton = (kind: 'color' | 'highlight', icon: IconName, swatch: string) => (
    <ToolTip label={toolTip(kind)}>
      <View ref={(v) => void (refs.current[kind] = v)} collapsable={false}>
        <Pressable
          onPress={() => open(kind)}
          style={({ hovered }: { hovered?: boolean }) => [styles.tool, hovered && styles.toolHover]}
          accessibilityRole="button"
          accessibilityLabel={TOOLS[kind].name}
        >
          <MaterialCommunityIcons name={icon} size={18} color={c.text.primary} />
          <View style={[styles.swatchBar, { backgroundColor: swatch }]} />
        </Pressable>
      </View>
    </ToolTip>
  );

  /** A tool whose icon wouldn't say what it does: words instead. */
  const words = (key: ToolKey, onPress: () => void) => (
    <ToolTip label={toolTip(key)}>
      <Pressable
        onPress={onPress}
        style={({ hovered }: { hovered?: boolean }) => [styles.wordTool, hovered && styles.toolHover]}
        accessibilityRole="button"
        accessibilityLabel={TOOLS[key].name}
      >
        <Text style={styles.wordToolText}>{TOOLS[key].name}</Text>
      </Pressable>
    </ToolTip>
  );

  const row = (key: string, children: React.ReactNode, onPress: () => void, checked: boolean, hint?: string, label?: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean }) => [styles.menuRow, hovered && styles.toolHover]}
      accessibilityRole="menuitem"
      {...a11yState({ checked })}
      accessibilityLabel={label}
    >
      <View style={styles.check}>{checked && <MaterialCommunityIcons name="check" size={16} color={c.accentDark} />}</View>
      <View style={styles.flex}>{children}</View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Pressable>
  );
  /** A menu item with its icon and name (Insert, Align). */
  const iconRow = (key: ToolKey, icon: IconName, onPress: () => void, checked = false, spoken: string = TOOLS[key].name) =>
    row(
      key,
      <View style={styles.rowInner}>
        <MaterialCommunityIcons name={icon} size={18} color={c.text.primary} />
        <Text style={styles.menuText}>{TOOLS[key].name}</Text>
      </View>,
      onPress,
      checked,
      (TOOLS[key] as ToolName).keys,
      spoken,
    );
  const heading = (text: string) => (
    <Text key={`h-${text}`} style={styles.menuHeading} accessibilityRole="header">
      {text}
    </Text>
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
  const gap = (key: string): Item => ({ key, width: GAP_W, node: <View style={styles.gap} />, gap: true });
  const t = (key: string, node: React.ReactNode, width = TOOL_W): Item => ({ key, width, node });
  const alignNow = ALIGNS.find((a) => a.key === s.align) ?? ALIGNS[0];
  const viewText = view ? `${view.pages ? 'Pages' : 'Pageless'} · ${percent(view.shown)}` : '';

  // The simplicity pass (Lea, before 4.6): five groups with separators,
  // Text · Format · Paragraph · Insert · View, after undo and redo; the
  // rarely used tools behind ⌄. What doesn't fit a narrow window moves there too.
  const primary: Item[] = [
    t('undo', tool('undo', 'undo', { type: 'undo' }, { disabled: !s.canUndo })),
    t('redo', tool('redo', 'redo', { type: 'redo' }, { disabled: !s.canRedo })),
    gap('g-text'),
    t('style', dropdown('style', 'style', styleLabel, 118), 124),
    t('font', dropdown('font', 'font', font.label, 100, { textStyle: font.css ? { fontFamily: font.css } : undefined }), 106),
    t(
      'size',
      <View style={styles.size}>
        {tool('smaller', 'minus', { type: 'sizeStep', direction: -1 })}
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
          accessibilityLabel={TOOLS.size.name}
          inputMode="numeric"
          selectTextOnFocus
        />
        {tool('bigger', 'plus', { type: 'sizeStep', direction: 1 })}
      </View>,
      108,
    ),
    gap('g-format'),
    t('bold', tool('bold', 'format-bold', { type: 'mark', mark: 'bold' }, { active: s.bold })),
    t('italic', tool('italic', 'format-italic', { type: 'mark', mark: 'italic' }, { active: s.italic })),
    t('underline', tool('underline', 'format-underline', { type: 'mark', mark: 'underline' }, { active: s.underline })),
    t('color', swatchButton('color', 'format-color-text', s.color ?? PAGE_COLORS.text.primary)),
    t('highlight', swatchButton('highlight', 'marker', s.highlight && s.highlight !== 'default' ? s.highlight : c.border)),
    gap('g-paragraph'),
    t('bullet', tool('bullet', 'format-list-bulleted', { type: 'list', list: 'bullet' }, { active: s.list === 'bullet' })),
    t('ordered', tool('ordered', 'format-list-numbered', { type: 'list', list: 'ordered' }, { active: s.list === 'ordered' })),
    t('align', dropdown('align', 'align', '', 52, { icon: ALIGN_ICON[alignNow.key] }), 58),
    t('spacing', dropdown('spacing', 'spacing', `Spacing ${SPACING_LABEL[s.lineSpacing] ?? s.lineSpacing}`, 122), 128),
    gap('g-insert'),
    t('insert', dropdown('insert', 'insert', 'Insert', 84), 90),
    ...(view ? [gap('g-view'), t('view', dropdown('view', 'view', viewText, 136), 142)] : []),
  ];
  const secondary: Item[] = [
    t('strike', tool('strike', 'format-strikethrough-variant', { type: 'mark', mark: 'strike' }, { active: s.strike })),
    t('clear', words('clear', () => run({ type: 'clear' })), 128),
    gap('g-more'),
    t('checklist', tool('task', 'format-list-checks', { type: 'list', list: 'task' }, { active: s.list === 'task' })),
    t(
      'indent',
      <View style={styles.size}>
        <Text style={styles.groupWord}>Indent</Text>
        {tool('outdent', 'format-indent-decrease', { type: 'outdent' }, { disabled: !s.canOutdent })}
        {tool('indent', 'format-indent-increase', { type: 'indent' }, { disabled: !s.canIndent })}
      </View>,
      124,
    ),
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
        <ToolTip label={expanded ? TOOLS.fewer.name : TOOLS.more.name}>
        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={({ hovered }: { hovered?: boolean }) => [styles.tool, hovered && styles.toolHover, expanded && styles.toolActive]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Fewer tools' : 'More tools'}
          {...a11yState({ expanded })}
        >
          <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={expanded ? c.accentDark : c.text.primary} />
        </Pressable>
        </ToolTip>
      </View>
      {showSecond && (
        <View style={[styles.row, styles.secondRow]}>
          {trimGaps(second).map(measuredItem)}
        </View>
      )}

      <ToolbarPopover anchor={menu?.kind === 'style' ? menu.anchor : null} onClose={close} width={250} label="Text style">
        {heading('Text style')}
        {TEXT_STYLES.map((t) =>
          row(t.key, <Text style={[styles.menuText, STYLE_LOOK[t.key]]}>{t.label}</Text>, () => run({ type: 'style', style: t.key }), t.key === s.style, t.shortcut),
        )}
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'font' ? menu.anchor : null} onClose={close} width={200} label="Font">
        {heading('Font')}
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
        <TableSizeForm rows={3} cols={3} action="Insert table" onSubmit={(rows, cols) => run({ type: 'table', action: 'insert', rows, cols })} />
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'align' ? menu.anchor : null} onClose={close} width={210} label="Align">
        {heading('Align')}
        {iconRow('alignLeft', ALIGN_ICON.left, () => run({ type: 'align', align: 'left' }), s.align === 'left', 'Align left')}
        {iconRow('alignCenter', ALIGN_ICON.center, () => run({ type: 'align', align: 'center' }), s.align === 'center', 'Align centre')}
        {iconRow('alignRight', ALIGN_ICON.right, () => run({ type: 'align', align: 'right' }), s.align === 'right', 'Align right')}
        {iconRow('alignJustify', ALIGN_ICON.justify, () => run({ type: 'align', align: 'justify' }), s.align === 'justify', 'Justify')}
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'insert' ? menu.anchor : null} onClose={close} width={230} label="Insert">
        {heading('Insert')}
        {iconRow('link', 'link-variant', () => void open('link', 'insert'), false, 'Insert link')}
        {iconRow('image', 'image-outline', () => (close(), (onImage ?? soon('Images'))()), false, 'Insert image')}
        {iconRow('table', 'table-large-plus', () => void open('table', 'insert'), false, 'Insert table')}
        {iconRow('formula', 'sigma', () => (close(), void openFormula()), false, 'Insert formula')}
        {iconRow('formulaLibrary', 'book-open-variant', () => void open('library', 'insert'), false, 'Insert formula from the library')}
        {iconRow('graph', 'chart-bar', () => (close(), insertGraph()), false, 'Insert graph')}
        {iconRow('comment', 'comment-plus-outline', () => (close(), (onComment ?? soon('Comments'))()), false, 'Insert comment')}
        {iconRow('pageBreak', 'format-page-break', () => run({ type: 'pageBreak' }), false, 'Insert page break')}
        {heading('Study blocks')}
        {iconRow('callout', 'card-text-outline', () => void open('callout', 'insert'), false, 'Insert callout')}
        {iconRow('mark', 'flag-outline', () => void open('mark', 'insert'), false, 'Insert mark')}
        {iconRow('timestamp', 'clock-outline', () => (close(), void askTimestamp()), false, 'Insert timestamp')}
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'callout' ? menu.anchor : null} onClose={close} width={250} label="Callout">
        {heading(s.callout ? 'Change to' : 'Callout')}
        <CalloutKinds current={s.callout?.kind} onPick={(kind) => run({ type: 'callout', action: 'set', kind })} />
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'library' ? menu.anchor : null} onClose={close} width={320} label="Formula library">
        {heading('Formula library')}
        <FormulaLibrary autoFocus maxHeight={380} onPick={(id) => run({ type: 'formulaCard', id })} />
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'mark' ? menu.anchor : null} onClose={close} width={300} label="Mark">
        <View style={styles.picker}>
          <MarkForm kind="important" level={null} action="Insert" onSubmit={(kind, level) => run({ type: 'markChip', action: 'insert', kind, level })} />
        </View>
      </ToolbarPopover>
      {view && (
        <ToolbarPopover anchor={menu?.kind === 'view' ? menu.anchor : null} onClose={close} width={220} label="View">
          {heading('Layout')}
          {row('pages', <Text style={styles.menuText}>Pages</Text>, () => (close(), view.set({ pages: true })), view.pages)}
          {row('pageless', <Text style={styles.menuText}>Pageless</Text>, () => (close(), view.set({ pages: false })), !view.pages)}
          {heading('Zoom')}
          {(['fit', ...ZOOM_STEPS] as ZoomSetting[]).map((z) =>
            row(
              String(z),
              <Text style={styles.menuText}>{z === 'fit' ? `Fit to window (${percent(view.shown)})` : percent(z)}</Text>,
              () => {
                close();
                view.set({ zoom: z });
              },
              view.zoom === z,
              z === 1 ? '⌘0' : undefined,
            ),
          )}
          <Text style={styles.menuFoot}>Zoom in ⌘+ · Zoom out ⌘−</Text>
        </ToolbarPopover>
      )}
      <ToolbarPopover anchor={menu?.kind === 'spacing' ? menu.anchor : null} onClose={close} width={170} label="Line spacing">
        {heading('Line spacing')}
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
    rowInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuHeading: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary, textTransform: 'uppercase', letterSpacing: 0.6 },
    menuFoot: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4, fontSize: Typography.size.xs, color: c.text.secondary },
    wordTool: { height: 32, paddingHorizontal: 8, borderRadius: 8, justifyContent: 'center' },
    wordToolText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.primary },
    groupWord: { marginLeft: 6, marginRight: 2, fontSize: Typography.size.sm, color: c.text.secondary },
    check: { width: 22 },
    menuText: { fontSize: Typography.size.base, color: c.text.primary },
    hint: { fontSize: Typography.size.xs, color: c.text.secondary, marginLeft: 8 },
    picker: { paddingHorizontal: 12, paddingVertical: 6 },
  });
