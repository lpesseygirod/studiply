import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { PHOTO_CLASS, PHOTO_WIDTHS, selectedPhotoIn, type PhotoAlign, type PhotoWrap } from './schema/photo';
import { TABLE_BAR_CLASS, visibleTop } from './table/tableBar';
import { nameButton } from './barHint';

/**
 * The photo bar (after test B, Lea: "options in the image's menu on both
 * devices"): while a photo is selected, a small bar sits just above it
 * (below it at the top of the page), drawn by both editors:
 *
 *   In line · Wrap left · Wrap right · Break text | Left Centre Right | S M L Full | Delete
 *
 * In words with a small picture (the simplicity pass); every
 * button says its name on hover or a long press (barHint.ts). Where the bar
 * can't fit (a phone), the layouts and alignments become one "Layout…"
 * button that asks the device for its menu (the laptop's right-click menu,
 * the iPhone's action sheet), as the table bar asks for its menus.
 *
 * Every button acts at once. Alignment is for Break text (a photo in a line
 * follows its line; a wrapped one sits on its side). It looks like the table
 * bar (its styles), so both read as the same kind of thing.
 */

export const PHOTO_BAR_CLASS = 'studiply-photo-bar';
export const PHOTO_SIZE_CLASS = 'studiply-photo-bar-size';
/** Shown where the bar fits (hidden on a phone), and the phone's one Layout… button. */
export const PHOTO_WIDE_CLASS = 'studiply-photo-bar-wide';
export const PHOTO_NARROW_CLASS = 'studiply-photo-bar-narrow';
/** On the bar when it doesn't fit whole: the wide items give way to Layout…. */
export const PHOTO_COMPACT_CLASS = 'studiply-photo-bar-compact';
/** Laptop: `detail` is { x, y } (where to open the photo menu). */
export const PHOTO_BAR_EVENT = 'studiply-photo-bar';
export interface PhotoBarRequest {
  id: number;
}
export const photoBarKey = new PluginKey<PhotoBarRequest | null>('studiplyPhotoBar');
const GAP = 8;

const line = (y: number, x1 = 2, x2 = 16) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;
const svg = (body: string) =>
  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${body}</svg>`;
const box = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="currentColor" stroke="none" opacity="0.55"/>`;

const LAYOUTS: { wrap: PhotoWrap; label: string; word: string; icon: string }[] = [
  { wrap: 'inline', label: 'In line with text', word: 'In line', icon: svg(line(4) + line(9, 2, 6) + box(7, 6.5, 5, 5) + line(9, 13, 16) + line(14)) },
  { wrap: 'left', label: 'Wrap left', word: 'Wrap left', icon: svg(box(2, 3, 7, 7) + line(4, 11) + line(8, 11) + line(12) + line(16)) },
  { wrap: 'right', label: 'Wrap right', word: 'Wrap right', icon: svg(box(9, 3, 7, 7) + line(4, 2, 7) + line(8, 2, 7) + line(12) + line(16)) },
  { wrap: 'break', label: 'Break text', word: 'Break text', icon: svg(line(2.5) + box(5, 5, 8, 8) + line(15.5)) },
];
const ALIGNS: { align: PhotoAlign; label: string; word: string }[] = [
  { align: 'left', label: 'Align photo left', word: 'Left' },
  { align: 'center', label: 'Centre photo', word: 'Centre' },
  { align: 'right', label: 'Align photo right', word: 'Right' },
];
const SIZES: { width: number; text: string; label: string; name: string }[] = [
  { width: PHOTO_WIDTHS.small, text: 'S', label: 'Photo size small', name: 'Small' },
  { width: PHOTO_WIDTHS.medium, text: 'M', label: 'Photo size medium', name: 'Medium' },
  { width: PHOTO_WIDTHS.large, text: 'L', label: 'Photo size large', name: 'Large' },
  { width: PHOTO_WIDTHS.full, text: 'Full', label: 'Photo size full width', name: 'Full width' },
];

class PhotoBarView {
  private bar = document.createElement('div');
  private buttons: { el: HTMLButtonElement; on: () => boolean; enabled?: () => boolean }[] = [];
  private refresh = () => this.update(this.view);

  constructor(
    private view: EditorView,
    private editor: Editor,
  ) {
    this.bar.className = `${TABLE_BAR_CLASS} ${PHOTO_BAR_CLASS}`;
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', 'Photo');
    this.bar.style.display = 'none';
    const info = () => selectedPhotoIn(this.view.state);
    const add = (label: string, content: string, act: () => void, on: () => boolean = () => false, enabled?: () => boolean, html = true, cls = '', name = label) => {
      const el = document.createElement('button');
      el.type = 'button';
      nameButton(el, name, undefined, label);
      if (cls) el.className = cls;
      if (html) el.innerHTML = content;
      else el.textContent = content;
      // Pressing the bar must not take the focus (or the keyboard) from the text.
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', act);
      this.bar.appendChild(el);
      this.buttons.push({ el, on, enabled });
      return el;
    };
    const divider = (cls = '') => {
      const d = document.createElement('span');
      d.className = `${PHOTO_BAR_CLASS}-divider ${cls}`.trim();
      this.bar.appendChild(d);
    };
    const word = (text: string) => `<span class="${PHOTO_BAR_CLASS}-word">${text}</span>`;
    // A phone: one Layout… for the layouts and alignments (editorCss shows it there instead).
    add('Photo layout', `Layout…`, () => this.ask(), undefined, undefined, false, PHOTO_NARROW_CLASS, 'Layout');
    for (const l of LAYOUTS)
      add(l.label, l.icon + word(l.word), () => this.editor.chain().setPhotoLayout({ wrap: l.wrap }).run(), () => info()?.wrap === l.wrap, undefined, true, PHOTO_WIDE_CLASS);
    divider(PHOTO_WIDE_CLASS);
    for (const a of ALIGNS)
      add(a.label, a.word, () => this.editor.chain().setPhotoLayout({ align: a.align }).run(), () => info()?.wrap === 'break' && info()?.align === a.align, () => info()?.wrap === 'break', false, PHOTO_WIDE_CLASS, a.word === 'Centre' ? 'Centre' : `Align ${a.word.toLowerCase()}`);
    // On a phone the keyboard toolbar has the sizes; the bar leaves them out there (editorCss).
    divider(PHOTO_SIZE_CLASS);
    for (const sz of SIZES) add(sz.label, sz.text, () => this.editor.chain().setPhotoWidth(sz.width).run(), () => info()?.width === sz.width, undefined, false, PHOTO_SIZE_CLASS, sz.name);
    divider();
    add('Delete photo', 'Delete', () => this.editor.chain().focus().deleteSelection().run(), undefined, undefined, false, '', 'Delete photo').classList.add('danger');
    view.dom.addEventListener('focus', this.refresh);
    view.dom.addEventListener('blur', this.refresh);
    window.addEventListener('resize', this.refresh);
  }

  /** Layout… (a phone): the device opens its photo menu, as for the table bar's menus. */
  private ask() {
    const box = this.bar.getBoundingClientRect();
    this.view.dom.dispatchEvent(new CustomEvent(PHOTO_BAR_EVENT, { bubbles: true, detail: { x: box.left, y: box.bottom + 4 } }));
    // A time, so a press after the editor reloaded is still new to the app.
    this.view.dispatch(this.view.state.tr.setMeta(photoBarKey, { id: Date.now() }));
  }

  update(view: EditorView) {
    this.view = view;
    const parent = view.dom.parentElement;
    const found = this.editor.isEditable ? selectedPhotoIn(view.state) : null;
    const frame = found ? (view.nodeDOM(found.pos) as HTMLElement | null)?.querySelector<HTMLElement>(`.${PHOTO_CLASS}-frame`) : null;
    if (!parent || !found || !frame || !view.hasFocus()) {
      this.bar.style.display = 'none';
      return;
    }
    if (this.bar.parentElement !== parent) {
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      parent.appendChild(this.bar);
    }
    this.bar.style.display = 'flex';
    // Where the whole bar doesn't fit (a narrow window, a phone): one Layout… for the layouts and alignments.
    this.bar.style.maxWidth = `${parent.getBoundingClientRect().width}px`;
    this.bar.classList.remove(PHOTO_COMPACT_CLASS);
    if (this.bar.scrollWidth > this.bar.clientWidth + 1) this.bar.classList.add(PHOTO_COMPACT_CLASS);
    for (const b of this.buttons) {
      b.el.setAttribute('aria-pressed', String(b.on()));
      b.el.disabled = b.enabled ? !b.enabled() : false;
    }
    const box = parent.getBoundingClientRect();
    const photo = frame.getBoundingClientRect();
    const height = this.bar.offsetHeight;
    const fitsAbove = photo.top - height - GAP >= visibleTop(parent);
    this.bar.style.top = `${fitsAbove ? photo.top - box.top - height - GAP : photo.bottom - box.top + GAP}px`;
    this.bar.style.maxWidth = `${box.width}px`;
    this.bar.style.left = `${Math.max(0, Math.min(photo.left - box.left, box.width - this.bar.offsetWidth))}px`;
  }

  destroy() {
    this.view.dom.removeEventListener('focus', this.refresh);
    this.view.dom.removeEventListener('blur', this.refresh);
    window.removeEventListener('resize', this.refresh);
    this.bar.remove();
  }
}

export const PhotoBar = Extension.create({
  name: 'photoBar',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<PhotoBarRequest | null>({
        key: photoBarKey,
        state: {
          init: () => null,
          apply: (tr, value) => tr.getMeta(photoBarKey) ?? value,
        },
        view: (view) => new PhotoBarView(view, editor),
      }),
    ];
  },
});
