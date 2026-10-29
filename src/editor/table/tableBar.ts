import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { selectedTable } from './selection';
import { nameButton } from '../barHint';
import { HANDLE_ROOM } from './tableHandles';

/**
 * The floating table bar (step 4.5, Lea: "table editing should happen on the
 * table itself"): while the cursor is in a table, a small bar sits just
 * above it (below it when there's no room above), on both devices:
 *
 *   Rows ▾ · Columns ▾ · Colour · Header · ⋯ · Delete
 *
 * Header and Delete act at once. The others ask the device for a menu, so
 * each device shows its own: the laptop gets a DOM event with where the
 * button is (TableMenus opens a popover there); the iPhone reads the
 * request from the editor state (formatState's `tableRequest`, published to
 * the app on every transaction) and opens an action sheet or a panel.
 *
 * Plain DOM next to the editor (not in the document), styled by editorCss.
 */

export type TableBarButton = 'rows' | 'columns' | 'colour' | 'more';
export interface TableBarRequest {
  id: number;
  button: TableBarButton;
}
/** Laptop: `detail` is { button, x, y } (the window position to open the menu at). */
export const TABLE_BAR_EVENT = 'studiply-table-bar';
export const TABLE_BAR_CLASS = 'studiply-table-bar';

export const tableBarKey = new PluginKey<TableBarRequest | null>('studiplyTableBar');

const BUTTONS: { key: TableBarButton | 'header' | 'delete'; text: string; label: string }[] = [
  { key: 'rows', text: 'Rows ▾', label: 'Table rows' },
  { key: 'columns', text: 'Columns ▾', label: 'Table columns' },
  { key: 'colour', text: 'Colour', label: 'Cell colour' },
  { key: 'header', text: 'Header', label: 'Header row' },
  { key: 'more', text: 'More ▾', label: 'More table options' },
  { key: 'delete', text: 'Delete', label: 'Delete table' },
];
const GAP = 6;

/** The top of what can be seen around `el`: its scrolling container's top, or the window's. */
export function visibleTop(el: HTMLElement): number {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n);
    if (overflowY === 'auto' || overflowY === 'scroll') return n.getBoundingClientRect().top;
  }
  return 0;
}

class TableBarView {
  private bar: HTMLDivElement;
  private swatch: HTMLSpanElement;
  private header: HTMLButtonElement;
  private refresh = () => this.update(this.view);

  constructor(
    private view: EditorView,
    private editor: Editor,
  ) {
    this.bar = document.createElement('div');
    this.bar.className = TABLE_BAR_CLASS;
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', 'Table');
    this.bar.style.display = 'none';
    this.swatch = document.createElement('span');
    this.swatch.className = `${TABLE_BAR_CLASS}-swatch`;
    this.header = document.createElement('button');
    for (const b of BUTTONS) {
      const button = b.key === 'header' ? this.header : document.createElement('button');
      button.type = 'button';
      const text = document.createElement('span');
      text.className = `${TABLE_BAR_CLASS}-text`;
      text.textContent = b.text;
      button.appendChild(text);
      nameButton(button, b.label);
      button.dataset.key = b.key;
      if (b.key === 'colour') button.prepend(this.swatch);
      if (b.key === 'delete') button.classList.add('danger');
      // Pressing the bar must not take the focus (or the keyboard) from the text.
      button.addEventListener('mousedown', (e) => e.preventDefault());
      button.addEventListener('click', () => this.press(b.key, button));
      this.bar.appendChild(button);
    }
    view.dom.addEventListener('focus', this.refresh);
    view.dom.addEventListener('blur', this.refresh);
    window.addEventListener('resize', this.refresh);
  }

  private press(key: (typeof BUTTONS)[number]['key'], button: HTMLElement) {
    if (key === 'header') return void this.editor.chain().focus().toggleHeaderRow().run();
    if (key === 'delete') return void this.editor.chain().focus().deleteTable().run();
    const box = button.getBoundingClientRect();
    this.view.dom.dispatchEvent(new CustomEvent(TABLE_BAR_EVENT, { bubbles: true, detail: { button: key, x: box.left, y: box.bottom + 4 } }));
    // A time, so a press after the editor reloaded is still new to the app.
    this.view.dispatch(this.view.state.tr.setMeta(tableBarKey, { id: Date.now(), button: key }));
  }

  update(view: EditorView) {
    this.view = view;
    const parent = view.dom.parentElement;
    const found = this.editor.isEditable ? selectedTable(view.state) : null;
    const tableDom = found ? (view.nodeDOM(found.pos) as HTMLElement | null) : null;
    if (!parent || !found || !tableDom || !view.hasFocus()) {
      this.bar.style.display = 'none';
      return;
    }
    if (this.bar.parentElement !== parent) {
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      parent.appendChild(this.bar);
    }
    this.bar.style.display = 'flex';
    const first = found.table.firstChild;
    const headerOn = !!first && first.childCount > 0 && Array.from({ length: first.childCount }, (_, i) => first.child(i)).every((c) => c.type.name === 'tableHeader');
    this.header.setAttribute('aria-pressed', String(headerOn));
    const colour = found.cell?.attrs.backgroundColor;
    this.swatch.style.background = typeof colour === 'string' && colour ? colour : '';
    this.swatch.classList.toggle('empty', !(typeof colour === 'string' && colour));

    const box = parent.getBoundingClientRect();
    const table = tableDom.getBoundingClientRect();
    const height = this.bar.offsetHeight;
    // The laptop's column handles sit between the table and the bar.
    const gap = this.editor.extensionManager.extensions.some((e) => e.name === 'tableHandles') ? HANDLE_ROOM + GAP : GAP;
    // Above the table while the page shows room for it there (over the line
    // before, as Google Docs); at the very top of the page, below it.
    const fitsAbove = table.top - height - gap >= visibleTop(parent);
    this.bar.style.top = `${fitsAbove ? table.top - box.top - height - gap : table.bottom - box.top + GAP}px`;
    // Kept on the page (a phone is narrower than the bar's full width).
    this.bar.style.maxWidth = `${box.width}px`;
    this.bar.style.left = `${Math.max(0, Math.min(table.left - box.left, box.width - this.bar.offsetWidth))}px`;
  }

  destroy() {
    this.view.dom.removeEventListener('focus', this.refresh);
    this.view.dom.removeEventListener('blur', this.refresh);
    window.removeEventListener('resize', this.refresh);
    this.bar.remove();
  }
}

export const TableBar = Extension.create({
  name: 'tableBar',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<TableBarRequest | null>({
        key: tableBarKey,
        state: {
          init: () => null,
          apply: (tr, value) => tr.getMeta(tableBarKey) ?? value,
        },
        view: (view) => new TableBarView(view, editor),
      }),
    ];
  },
});
