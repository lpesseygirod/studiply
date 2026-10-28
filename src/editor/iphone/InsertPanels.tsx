import React, { createContext, useContext, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomKeyboardExtension, useBridgeState, type CustomKeyboardComponentProps, type EditorBridge } from '@10play/tentap-editor';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { ColorGrid } from '../../components/editor/ColorGrid';
import { SpectrumPicker } from '../../components/editor/SpectrumPicker';
import { showAlert } from '../../components/dialogs/dialogs';
import { useRecentColours } from '../../services/preferences.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { FormatBridgeInstance, FormatBridgeState } from '../bridges/format';
import { MAX_TABLE, type FormatCommand, type TableAction } from '../format';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Bridge = EditorBridge & FormatBridgeInstance;

export interface TableSize {
  rows: number;
  cols: number;
}
/** What the table panel shows; the floating bar's Colour and Table size… open it on theirs. */
export type TableView = 'list' | 'colour' | 'spectrum' | 'size';

/**
 * What the panels ask of the editor screen: a link's address, a typed
 * number (the app's prompt with the number pad: the panels sit where the
 * keyboard goes, so a field in them can't bring one up), and the panel
 * state a prompt must not lose (kept on the screen, not in the panel).
 */
export interface PanelActionsValue {
  addLink: () => void;
  /** A number from 1 to `max`; a larger one comes back as `max`, `lowered`. Null when cancelled. */
  askNumber: (title: string, value: number, max: number) => Promise<{ value: number; lowered: boolean } | null>;
  insertSize: TableSize | null;
  setInsertSize: (size: TableSize | null) => void;
  tableView: TableView;
  setTableView: (view: TableView) => void;
  resize: TableSize | null;
  setResize: (size: TableSize | null) => void;
}
export const PanelActions = createContext<PanelActionsValue>({
  addLink: () => {},
  askNumber: async () => null,
  insertSize: null,
  setInsertSize: () => {},
  tableView: 'list',
  setTableView: () => {},
  resize: null,
  setResize: () => {},
});

function useFormat(editor: EditorBridge | undefined) {
  const bridge = editor as Bridge;
  const s = (useBridgeState(bridge) as ReturnType<typeof useBridgeState> & Partial<FormatBridgeState>).format;
  return { s, run: (cmd: FormatCommand) => bridge.format(cmd) };
}

function Header({ title, close }: { title: string; close?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable onPress={() => close?.()} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Show the keyboard">
        <MaterialCommunityIcons name="keyboard-outline" size={24} color={c.accentDark} />
      </Pressable>
    </View>
  );
}

/** − value + for rows or columns; tapping the number types it (the number pad). */
function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { askNumber } = useContext(PanelActions);
  const [lowered, setLowered] = useState(false);
  const set = (n: number) => {
    setLowered(false);
    onChange(n);
  };
  const ask = async () => {
    const typed = await askNumber(label, value, max);
    if (!typed) return;
    onChange(typed.value);
    setLowered(typed.lowered);
  };
  return (
    <View>
      <View style={styles.stepper}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.row}>
          <Pressable onPress={() => set(Math.max(1, value - 1))} style={[styles.iconButton, styles.box]} accessibilityRole="button" accessibilityLabel={`Fewer ${label.toLowerCase()}`}>
            <MaterialCommunityIcons name="minus" size={22} color={c.text.primary} />
          </Pressable>
          <Pressable onPress={() => void ask()} style={styles.countBox} accessibilityRole="button" accessibilityLabel={`${label}: ${value}. Type a number`}>
            <Text style={styles.count}>{value}</Text>
          </Pressable>
          <Pressable onPress={() => set(Math.min(max, value + 1))} style={[styles.iconButton, styles.box]} accessibilityRole="button" accessibilityLabel={`More ${label.toLowerCase()}`}>
            <MaterialCommunityIcons name="plus" size={22} color={c.text.primary} />
          </Pressable>
        </View>
      </View>
      {lowered && <Text style={styles.note}>Up to {max} {label.toLowerCase()}: lowered to {max}.</Text>}
    </View>
  );
}

/**
 * "+" (step 4.5, DESIGN's insert menu), in place of the keyboard: Photo,
 * Take photo, Table (rows and columns, then Insert), Formula, Link,
 * Comment. Photos, formulas and comments come with checkpoint B.
 */
function InsertPanel({ editor, close }: Partial<CustomKeyboardComponentProps>) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { run } = useFormat(editor);
  const { addLink, insertSize: table, setInsertSize: setTable } = useContext(PanelActions);
  const soon = (what: string) => () => showAlert(what, 'Coming in the next update.');

  if (table) {
    return (
      <View style={styles.panel}>
        <Header title="Table" close={close} />
        <View style={styles.content}>
          <Stepper label="Rows" value={table.rows} max={MAX_TABLE.rows} onChange={(rows) => setTable({ ...table, rows })} />
          <Stepper label="Columns" value={table.cols} max={MAX_TABLE.cols} onChange={(cols) => setTable({ ...table, cols })} />
          <Text style={styles.note}>Tap a number to type it (up to {MAX_TABLE.rows} × {MAX_TABLE.cols}).</Text>
          <View style={styles.row}>
            <Pressable onPress={() => setTable(null)} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>Back</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                run({ type: 'table', action: 'insert', rows: table.rows, cols: table.cols });
                setTable(null);
                close?.();
              }}
              style={styles.primary}
              accessibilityRole="button"
              accessibilityLabel={`Insert a ${table.rows} by ${table.cols} table`}
            >
              <Text style={styles.primaryText}>Insert {table.rows} × {table.cols}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const items: { label: string; icon: IconName; onPress: () => void }[] = [
    { label: 'Photo', icon: 'image-outline', onPress: soon('Photos') },
    { label: 'Take photo', icon: 'camera-outline', onPress: soon('Photos') },
    { label: 'Table', icon: 'table-large-plus', onPress: () => setTable({ rows: 3, cols: 3 }) },
    { label: 'Formula', icon: 'sigma', onPress: soon('Formulas') },
    {
      label: 'Link',
      icon: 'link-variant',
      onPress: () => {
        close?.();
        addLink();
      },
    },
    { label: 'Comment', icon: 'comment-plus-outline', onPress: soon('Comments') },
  ];
  return (
    <View style={styles.panel}>
      <Header title="Insert" close={close} />
      <View style={styles.grid}>
        {items.map((i) => (
          <Pressable key={i.label} onPress={i.onPress} style={styles.tile} accessibilityRole="button" accessibilityLabel={`Insert ${i.label.toLowerCase()}`}>
            <MaterialCommunityIcons name={i.icon} size={28} color={c.text.primary} />
            <Text style={styles.tileText}>{i.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const TABLE_ROWS: { action: TableAction; label: string; icon: IconName; danger?: boolean }[] = [
  { action: 'rowAbove', label: 'Row above', icon: 'table-row-plus-before' },
  { action: 'rowBelow', label: 'Row below', icon: 'table-row-plus-after' },
  { action: 'columnLeft', label: 'Column left', icon: 'table-column-plus-before' },
  { action: 'columnRight', label: 'Column right', icon: 'table-column-plus-after' },
  { action: 'deleteRow', label: 'Delete row', icon: 'table-row-remove', danger: true },
  { action: 'deleteColumn', label: 'Delete column', icon: 'table-column-remove', danger: true },
];

/**
 * The table the cursor is in (step 4.5), in place of the keyboard: rows and
 * columns, header row, cell colour (the colour picker), merge and split,
 * Table size… (rows × columns, typed or stepped), delete table. The
 * floating bar's Colour and Table size… open it on those.
 */
function TablePanel({ editor, close }: Partial<CustomKeyboardComponentProps>) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const { s, run } = useFormat(editor);
  const recent = useRecentColours();
  const { tableView: view, setTableView: setView, resize, setResize } = useContext(PanelActions);
  const size = Math.floor((width - 48 - 9 * 6) / 10);
  const pick = (colour: string | null) => {
    if (colour) recent.add(colour);
    run({ type: 'table', action: 'cellColor', color: colour });
    setView('list');
  };
  const current = { rows: s?.tableRows || 1, cols: s?.tableCols || 1 };
  const target = resize ?? current;
  const applySize = () => {
    const lostRows = (s?.filledRows ?? []).filter((r) => r >= target.rows).length;
    const lostCols = (s?.filledCols ?? []).filter((k) => k >= target.cols).length;
    const apply = () => {
      run({ type: 'table', action: 'resize', rows: target.rows, cols: target.cols });
      setResize(null);
      setView('list');
    };
    if (!lostRows && !lostCols) return apply();
    const parts = [lostRows && `${lostRows} ${lostRows === 1 ? 'row' : 'rows'}`, lostCols && `${lostCols} ${lostCols === 1 ? 'column' : 'columns'}`].filter(Boolean).join(' and ');
    showAlert(`Delete ${parts} with text?`, `Making the table ${target.rows} × ${target.cols} removes ${parts} that have text in them.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: apply },
    ]);
  };

  let body: React.ReactNode;
  if (view === 'colour' || view === 'spectrum') {
    body = (
      <View style={styles.card}>
        <View style={styles.cardInner}>
          {view === 'spectrum' ? (
            <SpectrumPicker initial={s?.cellColor ?? null} showHex={false} onDone={pick} onCancel={() => setView('colour')} width={width - 48} />
          ) : (
            <ColorGrid value={s?.cellColor ?? null} noneLabel="None" recent={recent.recent} onPick={pick} onMore={() => setView('spectrum')} size={size} kind="Cell colour" />
          )}
        </View>
      </View>
    );
  } else if (view === 'size') {
    body = (
      <>
        <Stepper label="Rows" value={target.rows} max={MAX_TABLE.rows} onChange={(rows) => setResize({ ...target, rows })} />
        <Stepper label="Columns" value={target.cols} max={MAX_TABLE.cols} onChange={(cols) => setResize({ ...target, cols })} />
        <Text style={styles.note}>Rows are added or removed at the bottom, columns at the right. Tap a number to type it.</Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => {
              setResize(null);
              setView('list');
            }}
            style={styles.secondary}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
          <Pressable onPress={applySize} style={styles.primary} accessibilityRole="button" accessibilityLabel={`Make the table ${target.rows} by ${target.cols}`}>
            <Text style={styles.primaryText}>
              Make it {target.rows} × {target.cols}
            </Text>
          </Pressable>
        </View>
      </>
    );
  } else {
    body = (
      <>
        <View style={styles.grid}>
          {TABLE_ROWS.map((a) => (
            <Pressable key={a.action} onPress={() => run({ type: 'table', action: a.action })} style={styles.tile} accessibilityRole="button">
              <MaterialCommunityIcons name={a.icon} size={26} color={a.danger ? c.error : c.text.primary} />
              <Text style={[styles.tileText, a.danger && { color: c.error }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.card}>
          <Pressable onPress={() => run({ type: 'table', action: 'headerRow' })} style={styles.listRow} accessibilityRole="switch" accessibilityState={{ checked: !!s?.headerRow }}>
            <Text style={styles.listText}>Header row</Text>
            <MaterialCommunityIcons name={s?.headerRow ? 'toggle-switch' : 'toggle-switch-off-outline'} size={34} color={s?.headerRow ? c.accentDark : c.text.secondary} />
          </Pressable>
          <Pressable onPress={() => setView('colour')} style={[styles.listRow, styles.divider]} accessibilityRole="button">
            <Text style={styles.listText}>Cell colour</Text>
            <View style={[styles.cellSwatch, { backgroundColor: s?.cellColor ?? c.card }]} />
          </Pressable>
          <Pressable
            onPress={() => {
              setResize(current);
              setView('size');
            }}
            style={[styles.listRow, styles.divider]}
            accessibilityRole="button"
          >
            <Text style={styles.listText}>Table size…</Text>
            <Text style={styles.listValue}>
              {current.rows} × {current.cols}
            </Text>
          </Pressable>
          {s?.canMerge && (
            <Pressable onPress={() => run({ type: 'table', action: 'merge' })} style={[styles.listRow, styles.divider]} accessibilityRole="button">
              <Text style={styles.listText}>Merge cells</Text>
            </Pressable>
          )}
          {s?.canSplit && (
            <Pressable onPress={() => run({ type: 'table', action: 'split' })} style={[styles.listRow, styles.divider]} accessibilityRole="button">
              <Text style={styles.listText}>Split cell</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              run({ type: 'table', action: 'deleteTable' });
              close?.();
            }}
            style={[styles.listRow, styles.divider]}
            accessibilityRole="button"
          >
            <Text style={[styles.listText, { color: c.error }]}>Delete table</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <View style={styles.panel}>
      <Header title="Table" close={close} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        {body}
      </ScrollView>
    </View>
  );
}

export const INSERT_PANEL = 'studiply-insert';
export const TABLE_PANEL = 'studiply-table';
export const InsertKeyboard = new CustomKeyboardExtension(INSERT_PANEL, InsertPanel);
export const TableKeyboard = new CustomKeyboardExtension(TABLE_PANEL, TablePanel);

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    panel: { flex: 1, backgroundColor: c.cardMuted },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 4, height: 48 },
    title: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    content: { paddingHorizontal: 12, paddingBottom: 24, gap: 12 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12 },
    tile: { width: '31%', minHeight: 76, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: c.card },
    tileText: { fontSize: Typography.size.sm, color: c.text.primary, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontSize: Typography.size.base, color: c.text.primary },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    box: { backgroundColor: c.card },
    countBox: { minWidth: 56, height: 44, marginHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    count: { textAlign: 'center', fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    note: { fontSize: Typography.size.sm, color: c.text.secondary, marginTop: 4 },
    listValue: { fontSize: Typography.size.base, color: c.text.secondary },
    secondary: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    secondaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    primary: { flex: 2, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    card: { borderRadius: 12, backgroundColor: c.card, overflow: 'hidden' },
    cardInner: { padding: 12 },
    listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 14 },
    listText: { fontSize: Typography.size.base, color: c.text.primary },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    cellSwatch: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: c.border },
  });
