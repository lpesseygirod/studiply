import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { DocColors } from '../../constants/colors';
import { LINK_EVENT } from './links';
import { canComment, COMMENT_EVENT } from '../schema/comments';
import { TABLE_BAR_CLASS } from '../table/tableBar';

/**
 * The selection bar (after test B, Lea): selected words get a small bar
 * right there: Comment first, then Bold, Italic, Highlight, Link. Drawn by
 * both editors: above the selection with a mouse (laptop), below it on a
 * touch screen (the iPhone), so iOS's own Copy / Paste menu above it stays
 * usable (adding to that menu would remove Copy and Paste: react-native-webview
 * turns the built-in items off when it has custom ones).
 *
 * Bold, Italic and Highlight act at once. Comment and Link ask the device,
 * as the table bar does: a DOM event on the laptop (its composer and link
 * dialog), a request in the editor state on the iPhone (its prompts).
 */

export const SELECTION_BAR_CLASS = 'studiply-selection-bar';
export type SelectionBarButton = 'comment' | 'link';
export interface SelectionBarRequest {
  id: number;
  button: SelectionBarButton;
}
export const selectionBarKey = new PluginKey<SelectionBarRequest | null>('studiplySelectionBar');

const GAP = 8;

/** Text is selected that the bar is for (not cells, a photo or a formula). */
export function showsSelectionBar(editor: Editor): boolean {
  const { selection } = editor.state;
  return selection instanceof TextSelection && canComment(editor.state);
}

class SelectionBarView {
  private bar = document.createElement('div');
  private buttons: { el: HTMLButtonElement; on: () => boolean }[] = [];
  private pointerDown = false;
  private refresh = () => this.update(this.view);
  private touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

  constructor(
    private view: EditorView,
    private editor: Editor,
  ) {
    this.bar.className = `${TABLE_BAR_CLASS} ${SELECTION_BAR_CLASS}`;
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', 'Selected text');
    this.bar.style.display = 'none';
    const add = (label: string, text: string, act: () => void, on: () => boolean = () => false, style = '') => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = text;
      el.setAttribute('aria-label', label);
      el.title = label;
      if (style) el.setAttribute('style', style);
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', act);
      this.bar.appendChild(el);
      this.buttons.push({ el, on });
    };
    add('Comment on the selection', 'Comment', () => this.ask('comment'));
    add('Bold', 'B', () => this.editor.chain().focus().toggleBold().run(), () => this.editor.isActive('bold'), 'font-weight: 800');
    add('Italic', 'I', () => this.editor.chain().focus().toggleItalic().run(), () => this.editor.isActive('italic'), 'font-style: italic; font-family: Georgia, serif');
    add(
      'Highlight',
      'Highlight',
      () =>
        this.editor.isActive('highlight')
          ? this.editor.chain().focus().unsetHighlight().run()
          : this.editor.chain().focus().setHighlight({ color: DocColors.highlight[0].value }).run(),
      () => this.editor.isActive('highlight'),
    );
    add('Link', 'Link', () => this.ask('link'), () => this.editor.isActive('link'));
    view.dom.addEventListener('mousedown', this.down);
    window.addEventListener('mouseup', this.up);
    view.dom.addEventListener('focus', this.refresh);
    view.dom.addEventListener('blur', this.refresh);
    window.addEventListener('resize', this.refresh);
  }

  // Not while the mouse is still selecting.
  private down = () => {
    this.pointerDown = true;
    this.bar.style.display = 'none';
  };
  private up = () => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    // After ProseMirror has taken the selection.
    setTimeout(this.refresh, 0);
  };

  private ask(button: SelectionBarButton) {
    const event = button === 'comment' ? COMMENT_EVENT : LINK_EVENT;
    this.view.dom.dispatchEvent(new CustomEvent(event, { bubbles: true }));
    // A time, so a press after the editor reloaded is still new to the app.
    this.view.dispatch(this.view.state.tr.setMeta(selectionBarKey, { id: Date.now(), button }));
  }

  update(view: EditorView) {
    this.view = view;
    const parent = view.dom.parentElement;
    if (!parent || this.pointerDown || !this.editor.isEditable || !view.hasFocus() || !showsSelectionBar(this.editor)) {
      this.bar.style.display = 'none';
      return;
    }
    if (this.bar.parentElement !== parent) {
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      parent.appendChild(this.bar);
    }
    this.bar.style.display = 'flex';
    for (const b of this.buttons) b.el.setAttribute('aria-pressed', String(b.on()));
    const { from, to } = view.state.selection;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    const box = parent.getBoundingClientRect();
    const height = this.bar.offsetHeight;
    const top = this.touch ? Math.max(start.bottom, end.bottom) + GAP : Math.min(start.top, end.top) - height - GAP;
    this.bar.style.top = `${top - box.top}px`;
    this.bar.style.maxWidth = `${box.width}px`;
    const left = Math.min(start.left, end.left);
    this.bar.style.left = `${Math.max(0, Math.min(left - box.left, box.width - this.bar.offsetWidth))}px`;
  }

  destroy() {
    this.view.dom.removeEventListener('mousedown', this.down);
    window.removeEventListener('mouseup', this.up);
    this.view.dom.removeEventListener('focus', this.refresh);
    this.view.dom.removeEventListener('blur', this.refresh);
    window.removeEventListener('resize', this.refresh);
    this.bar.remove();
  }
}

export const SelectionBar = Extension.create({
  name: 'selectionBar',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<SelectionBarRequest | null>({
        key: selectionBarKey,
        state: {
          init: () => null,
          apply: (tr, value) => tr.getMeta(selectionBarKey) ?? value,
        },
        view: (view) => new SelectionBarView(view, editor),
      }),
    ];
  },
});
