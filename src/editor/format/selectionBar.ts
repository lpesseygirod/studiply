import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { DocColors } from '../../constants/colors';
import { LINK_EVENT } from './links';
import { canComment, COMMENT_EVENT } from '../schema/comments';
import { nameButton } from '../barHint';
import { TOOLS, type ToolKey, type ToolName } from '../toolNames';
import { TABLE_BAR_CLASS } from '../table/tableBar';
import { startSuggestion } from '../schema/suggestion';

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
 *
 * Added later (Lea): Callout ▸, Mark ▸ and Time ▸ follow, behind a divider,
 * each a small picture and a word. They ask the device the same way and open
 * the menus Insert already has: the callout kinds, the mark form, the time.
 * The callout takes the selected paragraphs (not offered in a table, which it
 * would take whole); a mark or a time goes right after the selection. On a
 * touch screen the three go to a second row, so the bar fits a phone.
 */

export const SELECTION_BAR_CLASS = 'studiply-selection-bar';
export type SelectionBarButton = 'comment' | 'link' | 'callout' | 'mark' | 'time' | 'ask';
/**
 * "✦ Ask Claude ▸": the laptop's screen opens the actions under the button (`detail` is
 * { x, y }); the iPhone sees the press in the format state. Either way the selection is kept as the
 * suggestion's range (schema/suggestion) when the bar is pressed.
 */
export const ASK_CLAUDE_EVENT = 'studiply-ask-claude';
/** Where the laptop's suggestion card goes: under the button (`x`, `y`) or above the bar (`above`), inside `bounds` (the editor as seen). */
export interface AskClaudeAnchor {
  x: number;
  y: number;
  above: number;
  bounds: { left: number; right: number; top: number; bottom: number };
}
export interface SelectionBarRequest {
  id: number;
  button: SelectionBarButton;
}
export const selectionBarKey = new PluginKey<SelectionBarRequest | null>('studiplySelectionBar');
/** The laptop's Callout ▸ / Mark ▸ / Time ▸: `detail` is the button and where its menu opens. */
export const SELECTION_MENU_EVENT = 'studiply-selection-menu';
export interface SelectionMenuDetail {
  button: 'callout' | 'mark' | 'time';
  x: number;
  y: number;
}

const GAP = 8;

const svg = (body: string) =>
  `<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  callout: svg('<rect x="2.5" y="3" width="13" height="12" rx="2"/><line x1="5.5" y1="3.5" x2="5.5" y2="14.5" stroke-width="2.4"/><line x1="8.5" y1="7" x2="12.5" y2="7"/><line x1="8.5" y1="11" x2="11.5" y2="11"/>'),
  mark: svg('<path d="M4.5 16V2.5h9l-2.2 3.5 2.2 3.5h-9"/>'),
  time: svg('<circle cx="9" cy="9" r="6.5"/><path d="M9 5.5V9l2.5 1.6"/>'),
  // The study assistant's sparkle (✦), as in its panel.
  ask: svg('<path d="M9 2.5l1.6 4.9L15.5 9l-4.9 1.6L9 15.5l-1.6-4.9L2.5 9l4.9-1.6z"/>'),
};

/** The selection is in a table: a callout would take the whole table. */
function inTable(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.spec.tableRole) return true;
  return false;
}

/** The part of `el` that is on screen: inside the window and every scrolling or clipping box around it. */
export function visibleBox(el: HTMLElement): { left: number; right: number; top: number; bottom: number } {
  const r = el.getBoundingClientRect();
  const seen = { left: Math.max(0, r.left), right: Math.min(window.innerWidth, r.right), top: Math.max(0, r.top), bottom: Math.min(window.innerHeight, r.bottom) };
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    const o = a.getBoundingClientRect();
    seen.left = Math.max(seen.left, o.left);
    seen.right = Math.min(seen.right, o.left + (a.clientWidth || o.width));
    seen.top = Math.max(seen.top, o.top);
    seen.bottom = Math.min(seen.bottom, o.top + (a.clientHeight || o.height));
  }
  // Never less than nothing (the editor scrolled out of sight).
  if (seen.right < seen.left) seen.right = seen.left;
  return seen;
}

/** Text is selected that the bar is for (not cells, a photo or a formula). */
export function showsSelectionBar(editor: Editor): boolean {
  const { selection } = editor.state;
  return selection instanceof TextSelection && canComment(editor.state);
}

class SelectionBarView {
  private bar = document.createElement('div');
  private buttons: { el: HTMLButtonElement; on: () => boolean; shown: () => boolean }[] = [];
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
    if (this.touch) this.bar.classList.add(`${SELECTION_BAR_CLASS}-touch`);
    const add = (label: string, text: string, act: () => void, on: () => boolean = () => false, style = '', key?: ToolKey, shown: () => boolean = () => true) => {
      const el = document.createElement('button');
      el.type = 'button';
      if (key) el.dataset.tool = key;
      // Our own markup (a picture and a word), never document text.
      if (text.startsWith('<svg')) el.innerHTML = text;
      else el.textContent = text;
      // Its name on hover or a long press ("Bold ⌘B"); VoiceOver reads the label ("Bold selection").
      nameButton(el, key ? TOOLS[key].name : label, key ? (TOOLS[key] as ToolName).keys : undefined, label);
      if (style) el.setAttribute('style', style);
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', act);
      this.bar.appendChild(el);
      this.buttons.push({ el, on, shown });
    };
    const more = (word: string) => `${word}<span class="${SELECTION_BAR_CLASS}-more" aria-hidden="true">▸</span>`;
    add('Comment on the selection', 'Comment', () => this.ask('comment'), undefined, '', 'comment');
    // Labels of their own: the toolbar has Bold, Italic, Highlight and Link too.
    add('Bold selection', 'B', () => this.editor.chain().focus().toggleBold().run(), () => this.editor.isActive('bold'), 'font-weight: 800', 'bold');
    add('Italic selection', 'I', () => this.editor.chain().focus().toggleItalic().run(), () => this.editor.isActive('italic'), 'font-style: italic; font-family: Georgia, serif', 'italic');
    add(
      'Highlight selection',
      'Highlight',
      () =>
        this.editor.isActive('highlight')
          ? this.editor.chain().focus().unsetHighlight().run()
          : this.editor.chain().focus().setHighlight({ color: DocColors.highlight[0].value }).run(),
      () => this.editor.isActive('highlight'),
      '',
      'highlight',
    );
    add('Link selection', 'Link', () => this.ask('link'), () => this.editor.isActive('link'), '', 'link');
    const split = document.createElement('span');
    split.className = `${SELECTION_BAR_CLASS}-split`;
    this.bar.appendChild(split);
    add('Callout from the selection', ICONS.callout + more('Callout'), () => this.ask('callout'), undefined, '', 'callout', () => !inTable(this.editor));
    add('Mark after the selection', ICONS.mark + more('Mark'), () => this.ask('mark'), undefined, '', 'mark');
    add('Time after the selection', ICONS.time + more('Time'), () => this.ask('time'), undefined, '', 'timestamp');
    // The study assistant's actions on the selection (Explain simpler, Give an example…).
    add('Ask Claude about the selection', ICONS.ask + more('Ask Claude'), () => this.ask('ask'), undefined, '', 'askClaude');
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
    if (button === 'ask') {
      // The selection becomes the suggestion's range now: the actions are picked after this.
      this.view.dispatch(startSuggestion(this.view.state.tr, this.view.state));
      const r = (this.buttons.find((b) => b.el.dataset.tool === 'askClaude')?.el ?? this.bar).getBoundingClientRect();
      // The card may use the editor's whole pane (the page can be shorter than the card).
      let pane = this.view.dom.parentElement;
      while (pane && pane !== document.body && getComputedStyle(pane).overflowY === 'visible') pane = pane.parentElement;
      const bounds = pane && pane !== document.body ? visibleBox(pane) : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
      const detail: AskClaudeAnchor = { x: r.left, y: r.bottom + 6, above: this.bar.getBoundingClientRect().top - 6, bounds };
      this.view.dom.dispatchEvent(new CustomEvent(ASK_CLAUDE_EVENT, { bubbles: true, detail }));
    } else if (button === 'comment' || button === 'link') {
      this.view.dom.dispatchEvent(new CustomEvent(button === 'comment' ? COMMENT_EVENT : LINK_EVENT, { bubbles: true }));
    } else {
      // The laptop opens its menu under the pressed button.
      const el = this.buttons.find((b) => b.el.dataset.tool === (button === 'time' ? 'timestamp' : button))?.el;
      const r = (el ?? this.bar).getBoundingClientRect();
      const detail: SelectionMenuDetail = { button, x: r.left, y: r.bottom + 6 };
      this.view.dom.dispatchEvent(new CustomEvent(SELECTION_MENU_EVENT, { bubbles: true, detail }));
    }
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
    for (const b of this.buttons) {
      b.el.setAttribute('aria-pressed', String(b.on()));
      b.el.style.display = b.shown() ? '' : 'none';
    }
    const { from, to } = view.state.selection;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    const box = parent.getBoundingClientRect();
    // As wide as the part of the editor that is seen (a page narrower than the bar, the panel beside it):
    // in one row when it fits, else Callout ▸ … Ask Claude ▸ go to a second row as on a touch screen.
    const seen = visibleBox(parent);
    this.bar.style.maxWidth = `${seen.right - seen.left}px`;
    // Measured at the left edge, where nothing but the width above narrows it.
    this.bar.style.left = '0px';
    this.bar.classList.remove(`${SELECTION_BAR_CLASS}-wrap`);
    if (this.bar.scrollWidth > this.bar.clientWidth + 1) this.bar.classList.add(`${SELECTION_BAR_CLASS}-wrap`);
    const height = this.bar.offsetHeight;
    const below = Math.max(start.bottom, end.bottom) + GAP;
    const above = Math.min(start.top, end.top) - height - GAP;
    // Above the selection with a mouse, unless that is out of sight.
    const top = this.touch || above < seen.top ? below : above;
    this.bar.style.top = `${top - box.top}px`;
    const left = Math.max(seen.left, Math.min(Math.min(start.left, end.left), seen.right - this.bar.offsetWidth));
    this.bar.style.left = `${left - box.left}px`;
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
