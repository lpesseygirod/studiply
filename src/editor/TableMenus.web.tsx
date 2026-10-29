import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Editor } from '@tiptap/react';
import { CellSelection } from '@tiptap/pm/tables';

import { showAlert, type Anchor } from '../components/dialogs/dialogs';
import { ColorGrid } from '../components/editor/ColorGrid';
import { SpectrumPicker } from '../components/editor/SpectrumPicker';
import { PopoverDivider, PopoverHeading, PopoverRow, ToolbarPopover } from '../components/editor/ToolbarPopover';
import { TableSizeForm } from '../components/editor/TableSizeForm';
import { useRecentColours } from '../services/preferences.service';
import { formatState, runFormat, type FormatCommand, type TableAction } from './format';
import { textLostByResize } from './table/resize';
import { selectedTable } from './table/selection';
import { TABLE_BAR_EVENT, type TableBarButton } from './table/tableBar';

type Kind = TableBarButton | 'all';
type Item = { action: TableAction | 'colour' | 'size'; label: string; danger?: boolean } | '-' | { heading: string };

const ROWS: Item[] = [{ heading: 'Rows' }, { action: 'rowAbove', label: 'Insert row above' }, { action: 'rowBelow', label: 'Insert row below' }, '-', { action: 'deleteRow', label: 'Delete row', danger: true }];
const COLUMNS: Item[] = [{ heading: 'Columns' }, { action: 'columnLeft', label: 'Insert column left' }, { action: 'columnRight', label: 'Insert column right' }, '-', { action: 'deleteColumn', label: 'Delete column', danger: true }];
const MORE: Item[] = [{ heading: 'Table' }, { action: 'headerRow', label: 'Header row' }, { action: 'merge', label: 'Merge cells' }, { action: 'split', label: 'Split cell' }, '-', { action: 'size', label: 'Table size…' }];
/** The right-click menu: everything, under headings (the simplicity pass before 4.6). */
const ALL: Item[] = [
  { heading: 'Rows' },
  { action: 'rowAbove', label: 'Insert row above' },
  { action: 'rowBelow', label: 'Insert row below' },
  { action: 'deleteRow', label: 'Delete row', danger: true },
  { heading: 'Columns' },
  { action: 'columnLeft', label: 'Insert column left' },
  { action: 'columnRight', label: 'Insert column right' },
  { action: 'deleteColumn', label: 'Delete column', danger: true },
  { heading: 'Table' },
  { action: 'headerRow', label: 'Header row' },
  { action: 'colour', label: 'Cell colour…' },
  { action: 'merge', label: 'Merge cells' },
  { action: 'split', label: 'Split cell' },
  { action: 'size', label: 'Table size…' },
  { action: 'deleteTable', label: 'Delete table', danger: true },
];
const ITEMS: Record<Exclude<Kind, 'colour'>, Item[]> = { rows: ROWS, columns: COLUMNS, more: MORE, all: ALL };

/**
 * The laptop's table menus (step 4.5, Lea: "table editing should happen on
 * the table itself, like Word/Google Docs"): the floating table bar's Rows,
 * Columns, Colour and ⋯ (tableBar.ts), and a right-click in a cell for the
 * whole menu at the pointer. Cell colour is the shared picker; Table size…
 * takes rows × columns typed in, asking first when that removes text.
 */
export function TableMenus({ editor }: { editor: Editor }) {
  const [menu, setMenu] = useState<{ kind: Kind; anchor: Anchor; view: 'list' | 'colour' | 'spectrum' | 'size' } | null>(null);
  const recent = useRecentColours();
  const s = formatState(editor);

  useEffect(() => {
    const dom = editor.view.dom;
    const onBar = (e: Event) => {
      const { button, x, y } = (e as CustomEvent<{ button: TableBarButton; x: number; y: number }>).detail;
      setMenu({ kind: button, anchor: { x, y }, view: button === 'colour' ? 'colour' : 'list' });
    };
    const onContextMenu = (e: MouseEvent) => {
      const cell = (e.target as HTMLElement | null)?.closest?.('td, th');
      if (!cell || !editor.isEditable) return;
      e.preventDefault();
      // Right-clicking inside selected cells keeps them; elsewhere the cursor goes where it was clicked.
      const keep = editor.state.selection instanceof CellSelection && cell.classList.contains('selectedCell');
      const at = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!keep && at) editor.chain().focus().setTextSelection(at.pos).run();
      if (!selectedTable(editor.state)) return;
      setMenu({ kind: 'all', anchor: { x: e.clientX, y: e.clientY }, view: 'list' });
    };
    dom.addEventListener(TABLE_BAR_EVENT, onBar);
    dom.addEventListener('contextmenu', onContextMenu);
    return () => {
      dom.removeEventListener(TABLE_BAR_EVENT, onBar);
      dom.removeEventListener('contextmenu', onContextMenu);
    };
  }, [editor]);

  const close = () => setMenu(null);
  const run = (cmd: FormatCommand) => {
    close();
    runFormat(editor, cmd);
  };
  const resize = (rows: number, cols: number) => {
    const found = selectedTable(editor.state);
    if (!found) return close();
    const lost = textLostByResize(found.table, rows, cols);
    const apply = () => run({ type: 'table', action: 'resize', rows, cols });
    if (!lost.rows && !lost.cols) return apply();
    close();
    const parts = [lost.rows && `${lost.rows} ${lost.rows === 1 ? 'row' : 'rows'}`, lost.cols && `${lost.cols} ${lost.cols === 1 ? 'column' : 'columns'}`].filter(Boolean);
    showAlert(`Delete ${parts.join(' and ')} with text?`, `Making the table ${rows} × ${cols} removes ${parts.join(' and ')} that have text in them.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: apply },
    ]);
  };
  const pickColour = (colour: string | null) => {
    if (colour) recent.add(colour);
    run({ type: 'table', action: 'cellColor', color: colour });
  };

  const enabled = (action: string) => (action === 'merge' ? s.canMerge : action === 'split' ? s.canSplit : true);
  const list = (items: Item[]) =>
    items.map((item, i) =>
      item === '-' ? (
        <PopoverDivider key={`divider-${i}`} />
      ) : 'heading' in item ? (
        <PopoverHeading key={`heading-${item.heading}`} text={item.heading} />
      ) : (
        <PopoverRow
          key={item.action}
          label={item.label}
          danger={item.danger}
          checked={item.action === 'headerRow' && s.headerRow}
          disabled={!enabled(item.action)}
          onPress={() =>
            item.action === 'colour'
              ? setMenu(menu && { ...menu, view: 'colour' })
              : item.action === 'size'
                ? setMenu(menu && { ...menu, view: 'size' })
                : run({ type: 'table', action: item.action })
          }
        />
      ),
    );

  const width = menu?.view === 'list' ? 220 : 260;
  return (
    <ToolbarPopover anchor={menu?.anchor ?? null} onClose={close} width={width} label="Table">
      {menu?.view === 'list' && menu.kind !== 'colour' && list(ITEMS[menu.kind])}
      {menu?.view === 'colour' && (
        <View style={styles.picker}>
          <ColorGrid value={s.cellColor} noneLabel="None" recent={recent.recent} onPick={pickColour} onMore={() => setMenu({ ...menu, view: 'spectrum' })} kind="Cell colour" />
        </View>
      )}
      {menu?.view === 'spectrum' && (
        <View style={styles.picker}>
          <SpectrumPicker initial={s.cellColor} showHex onDone={pickColour} onCancel={() => setMenu({ ...menu, view: 'colour' })} width={236} />
        </View>
      )}
      {menu?.view === 'size' && <TableSizeForm rows={s.tableRows} cols={s.tableCols} action="Apply" onSubmit={resize} />}
    </ToolbarPopover>
  );
}

const styles = StyleSheet.create({
  picker: { paddingHorizontal: 12, paddingVertical: 6 },
});
