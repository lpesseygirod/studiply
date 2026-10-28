import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

import { TableBar } from '../table/tableBar';

/**
 * Tables (steps 4.2, 4.5): pasted tables stay tables, and tables are made
 * and edited from the toolbars. A cell can have a colour (`backgroundColor`,
 * also read from a pasted cell's shading); on the laptop columns can be
 * dragged wider (their widths are saved, and the iPhone shows them).
 */

const backgroundColor = {
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-background') || el.style.backgroundColor || null,
    renderHTML: (attrs: Record<string, unknown>) =>
      typeof attrs.backgroundColor === 'string' && attrs.backgroundColor
        ? { 'data-background': attrs.backgroundColor, style: `background-color: ${attrs.backgroundColor}` }
        : {},
  },
};

export const StudiplyTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColor };
  },
});

export const StudiplyTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColor };
  },
});

export const TableBridge = new BridgeExtension({
  tiptapExtension: Table.configure({ resizable: true, cellMinWidth: 48, lastColumnResizable: false }),
  // The floating table bar (step 4.5) is drawn by both editors.
  tiptapExtensionDeps: [TableRow, StudiplyTableHeader, StudiplyTableCell, TableBar],
});
