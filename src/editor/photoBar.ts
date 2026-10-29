import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { PHOTO_CLASS, PHOTO_WIDTHS, selectedPhotoIn, type PhotoAlign, type PhotoWrap } from './schema/photo';
import { TABLE_BAR_CLASS, visibleTop } from './table/tableBar';

/**
 * The photo bar (after test B, Lea: "options in the image's menu on both
 * devices"): while a photo is selected, a small bar sits just above it
 * (below it at the top of the page), drawn by both editors:
 *
 *   In line · Wrap left · Wrap right · Break text | ◧ ▣ ◨ | S M L Full | Delete
 *
 * Every button acts at once. Alignment is for Break text (a photo in a line
 * follows its line; a wrapped one sits on its side). It looks like the table
 * bar (its styles), so both read as the same kind of thing.
 */

export const PHOTO_BAR_CLASS = 'studiply-photo-bar';
const GAP = 8;

const line = (y: number, x1 = 2, x2 = 16) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;
const svg = (body: string) =>
  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${body}</svg>`;
const box = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="currentColor" stroke="none" opacity="0.55"/>`;

const LAYOUTS: { wrap: PhotoWrap; label: string; icon: string }[] = [
  { wrap: 'inline', label: 'In line with text', icon: svg(line(4) + line(9, 2, 6) + box(7, 6.5, 5, 5) + line(9, 13, 16) + line(14)) },
  { wrap: 'left', label: 'Wrap left', icon: svg(box(2, 3, 7, 7) + line(4, 11) + line(8, 11) + line(12) + line(16)) },
  { wrap: 'right', label: 'Wrap right', icon: svg(box(9, 3, 7, 7) + line(4, 2, 7) + line(8, 2, 7) + line(12) + line(16)) },
  { wrap: 'break', label: 'Break text', icon: svg(line(2.5) + box(5, 5, 8, 8) + line(15.5)) },
];
const ALIGNS: { align: PhotoAlign; label: string; icon: string }[] = [
  { align: 'left', label: 'Align photo left', icon: svg(box(2, 4, 8, 7) + line(15)) },
  { align: 'center', label: 'Centre photo', icon: svg(box(5, 4, 8, 7) + line(15)) },
  { align: 'right', label: 'Align photo right', icon: svg(box(8, 4, 8, 7) + line(15)) },
];
const SIZES: { width: number; text: string; label: string }[] = [
  { width: PHOTO_WIDTHS.small, text: 'S', label: 'Photo size small' },
  { width: PHOTO_WIDTHS.medium, text: 'M', label: 'Photo size medium' },
  { width: PHOTO_WIDTHS.large, text: 'L', label: 'Photo size large' },
  { width: PHOTO_WIDTHS.full, text: 'Full', label: 'Photo size full width' },
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
    const add = (label: string, content: string, act: () => void, on: () => boolean = () => false, enabled?: () => boolean, html = true) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', label);
      el.title = label;
      if (html) el.innerHTML = content;
      else el.textContent = content;
      // Pressing the bar must not take the focus (or the keyboard) from the text.
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', act);
      this.bar.appendChild(el);
      this.buttons.push({ el, on, enabled });
      return el;
    };
    const divider = () => {
      const d = document.createElement('span');
      d.className = `${PHOTO_BAR_CLASS}-divider`;
      this.bar.appendChild(d);
    };
    for (const l of LAYOUTS) add(l.label, l.icon, () => this.editor.chain().setPhotoLayout({ wrap: l.wrap }).run(), () => info()?.wrap === l.wrap);
    divider();
    for (const a of ALIGNS)
      add(a.label, a.icon, () => this.editor.chain().setPhotoLayout({ align: a.align }).run(), () => info()?.wrap === 'break' && info()?.align === a.align, () => info()?.wrap === 'break');
    divider();
    for (const sz of SIZES) add(sz.label, sz.text, () => this.editor.chain().setPhotoWidth(sz.width).run(), () => info()?.width === sz.width, undefined, false);
    divider();
    add('Delete photo', 'Delete', () => this.editor.chain().focus().deleteSelection().run(), undefined, undefined, false).classList.add('danger');
    view.dom.addEventListener('focus', this.refresh);
    view.dom.addEventListener('blur', this.refresh);
    window.addEventListener('resize', this.refresh);
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
    return [new Plugin({ key: new PluginKey('studiplyPhotoBar'), view: (view) => new PhotoBarView(view, editor) })];
  },
});
