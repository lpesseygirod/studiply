import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView, NodeView } from '@tiptap/pm/view';

import { mediaIdOf, providePhoto, watchPhoto, type PhotoSource } from '../media/photoSource';
import type { DocJSON } from '../types';
import { newBlockId } from './blockMeta';
import { chipMs, TIMESTAMP_CHIP } from './timestampChip';

/**
 * Photos in documents, in place of TenTap's plain image: still
 * the `image` node (pasted pictures stay pictures), with
 * - `src` `media:<id>` for a photo added in Studiply (see media/photoSource),
 *   or a pasted picture's own address;
 * - `width` in % of the page, so a photo is as wide on the iPhone as on the
 *   laptop (null: its own size, at most the page's width).
 *
 * - `wrap` (after test B, Lea: as in Pages / Word): `break` (on lines of its
 *   own, between paragraphs; `align` left, centre or right), `left` / `right`
 *   (it floats on that side and the paragraphs after it flow around it).
 *   "In line with text" is a second node, `inlineImage`, inside a line like
 *   a big letter; switching converts between the two (`setPhotoLayout`).
 *
 * The node view shows the picture once resolved ("Loading photo…", or why it
 * can't show); handles on the corners of a selected photo drag its width
 * (a mouse on the laptop, a finger on the iPhone, test B). The iPhone also has
 * Small / Medium / Large / Full width in the keyboard toolbar.
 */

export const PHOTO_CLASS = 'studiply-photo';
export const INLINE_IMAGE = 'inlineImage';
export type PhotoWrap = 'inline' | 'break' | 'left' | 'right';
export type PhotoAlign = 'left' | 'center' | 'right';
const WRAPS: PhotoWrap[] = ['break', 'left', 'right'];
const ALIGNS: PhotoAlign[] = ['left', 'center', 'right'];
/** A photo set to wrap that would fill the line gets this width (text needs room beside it). */
const WRAP_WIDTH = 50;
/** Small / Medium / Large / Full width, in % of the page. */
export const PHOTO_WIDTHS = { small: 25, medium: 50, large: 75, full: 100 } as const;
const MIN_WIDTH_PX = 40;
const MIN_PCT = 5;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    photo: {
      /** Inserts photos (one block each) where the cursor is. */
      insertPhotos: (srcs: string[]) => ReturnType;
      /** The selected photo's width, in % of the page (null: its own size). */
      setPhotoWidth: (width: number | null) => ReturnType;
      /** Removes the photos with this `src` (one that couldn't be uploaded); not in Undo. */
      removePhotos: (src: string) => ReturnType;
      /** The selected photo's layout: in line, wrapped left or right, or on lines of its own (aligned). */
      setPhotoLayout: (layout: { wrap?: PhotoWrap; align?: PhotoAlign }) => ReturnType;
    };
    inlinePhoto: {
      /** A board photo taken while recording: a thumbnail on a line of its own with its time. */
      placePhotoLine: (src: string, ms: number) => ReturnType;
    };
  }
}

/** What a photo says until its picture is found (the PDF export waits for it to go). */
export const PHOTO_LOADING = 'Loading photo…';

const NOTES: Record<'loading' | 'offline' | 'missing' | 'broken', string> = {
  loading: PHOTO_LOADING,
  offline: 'Photo — shows when online',
  // Its row isn't there (yet): another device may still be uploading it; asked again every RETRY_MS.
  missing: 'Photo not uploaded yet',
  // A pasted picture whose address doesn't answer.
  broken: "This picture can't be shown",
};

/** A width in % from pasted or copied HTML (`data-width`, or a style width in %). */
function parseWidth(el: HTMLElement): number | null {
  const raw = el.getAttribute('data-width') ?? (el.style.width.endsWith('%') ? el.style.width.slice(0, -1) : null);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n)) : null;
}

const clampPct = (n: number) => Math.max(MIN_PCT, Math.min(100, Math.round(n)));

export const isPhoto = (node: PMNode | null | undefined) => !!node && (node.type.name === 'image' || node.type.name === INLINE_IMAGE);

export interface PhotoInfo {
  width: number | null;
  wrap: PhotoWrap;
  align: PhotoAlign;
}

/** A photo node's layout. */
export function photoInfo(node: PMNode): PhotoInfo {
  const width = node.attrs.width;
  const wrap: PhotoWrap = node.type.name === INLINE_IMAGE ? 'inline' : WRAPS.includes(node.attrs.wrap) ? node.attrs.wrap : 'break';
  const align: PhotoAlign = ALIGNS.includes(node.attrs.align) ? node.attrs.align : 'left';
  return { width: typeof width === 'number' ? width : null, wrap, align };
}

/** The selected photo, if the selection is one. */
export function selectedPhotoIn(state: EditorState): (PhotoInfo & { pos: number; node: PMNode }) | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || !isPhoto(selection.node)) return null;
  return { ...photoInfo(selection.node), pos: selection.from, node: selection.node };
}

export function selectedPhoto(editor: Editor): PhotoInfo | null {
  const found = selectedPhotoIn(editor.state);
  return found && { width: found.width, wrap: found.wrap, align: found.align };
}

/**
 * Changes the photo at `pos` to `wrap` / `align` in `tr`, converting between
 * the block photo and the photo in a line; returns where it now is (still
 * selected), or null if nothing was there.
 * - block → in line: it goes into a paragraph of its own, where text can be
 *   typed beside it;
 * - in line → block: it goes just before its paragraph (so a wrapped photo
 *   has that paragraph flowing around it); a paragraph left empty goes.
 */
export function layoutPhoto(tr: Transaction, pos: number, layout: { wrap?: PhotoWrap; align?: PhotoAlign }): number | null {
  const node = tr.doc.nodeAt(pos);
  if (!isPhoto(node)) return null;
  const schema = tr.doc.type.schema;
  const now = photoInfo(node!);
  const wrap = layout.wrap ?? now.wrap;
  const align = layout.align ?? now.align;
  // Wrapping a photo as wide as the line leaves no room for the text.
  const width = wrap === 'left' || wrap === 'right' ? (now.width === null || now.width >= 90 ? WRAP_WIDTH : now.width) : now.width;
  const shared = { src: node!.attrs.src, alt: node!.attrs.alt, title: node!.attrs.title, width };
  let at = pos;
  if (wrap === 'inline') {
    if (node!.type.name === INLINE_IMAGE) {
      tr.setNodeMarkup(pos, undefined, { ...node!.attrs, width });
    } else {
      const inline = schema.nodes[INLINE_IMAGE].create(shared);
      tr.replaceWith(pos, pos + node!.nodeSize, schema.nodes.paragraph.create(null, inline));
      at = pos + 1;
    }
  } else if (node!.type.name === INLINE_IMAGE) {
    const $pos = tr.doc.resolve(pos);
    const block = schema.nodes.image.create({ ...shared, wrap, align });
    const parentStart = $pos.before($pos.depth);
    const alone = $pos.parent.childCount === 1;
    if (alone && $pos.depth === 1) {
      tr.replaceWith(parentStart, parentStart + $pos.parent.nodeSize, block);
      at = parentStart;
    } else {
      tr.delete(pos, pos + node!.nodeSize);
      // Before its paragraph, at the top level (or before the list / table it is in).
      const top = tr.doc.resolve(tr.mapping.map(parentStart)).before(1);
      tr.insert(top, block);
      at = top;
    }
  } else {
    tr.setNodeMarkup(pos, undefined, { ...node!.attrs, wrap, align, width });
  }
  tr.setSelection(NodeSelection.create(tr.doc, at));
  return at;
}

class PhotoView implements NodeView {
  dom: HTMLElement;
  private frame: HTMLElement;
  private img = document.createElement('img');
  private note = document.createElement('span');
  private unwatch: (() => void) | null = null;
  private src: unknown = undefined;
  private drag: { startX: number; startWidth: number; page: number; sign: number } | null = null;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    // A photo in a line is inline itself.
    const inline = node.type.name === INLINE_IMAGE;
    this.dom = document.createElement(inline ? 'span' : 'div');
    this.frame = document.createElement(inline ? 'span' : 'div');
    this.dom.className = PHOTO_CLASS;
    this.frame.className = `${PHOTO_CLASS}-frame`;
    this.note.className = `${PHOTO_CLASS}-note`;
    this.img.draggable = false;
    this.img.addEventListener('error', this.onError);
    this.frame.append(this.img, this.note);
    // Corner handles for a mouse (laptop) and a finger (iPhone: bigger, see editorCss).
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const handle = document.createElement('span');
      const sign = corner.endsWith('w') ? -1 : 1;
      handle.className = `${PHOTO_CLASS}-handle`;
      handle.dataset.corner = corner;
      handle.setAttribute('aria-label', 'Resize photo');
      handle.addEventListener('mousedown', (e) => this.startDrag(e, e.clientX, sign));
      handle.addEventListener('touchstart', (e) => e.touches.length === 1 && this.startDrag(e, e.touches[0].clientX, sign), { passive: false });
      this.frame.appendChild(handle);
    }
    this.dom.appendChild(this.frame);
    this.render(node);
  }

  private render(node: PMNode) {
    this.node = node;
    const { src, alt } = node.attrs;
    const { width, wrap, align } = photoInfo(node);
    this.img.alt = typeof alt === 'string' ? alt : '';
    // Its width in % of the page (or line): on the photo itself when it floats or sits in a line, else on its frame.
    const outer = wrap !== 'break';
    this.dom.style.width = outer && width !== null ? `${width}%` : '';
    this.frame.style.width = !outer && width !== null ? `${width}%` : '';
    this.frame.classList.toggle('sized', width !== null);
    this.dom.dataset.wrap = wrap;
    this.dom.dataset.align = align;
    if (src === this.src) return;
    this.src = src;
    this.unwatch?.();
    this.unwatch = null;
    const id = mediaIdOf(src);
    if (!id) return this.show(typeof src === 'string' && src ? { url: src } : { state: 'missing' });
    this.show(null);
    this.unwatch = watchPhoto(id, (source) => this.show(source));
  }

  /** null: still loading. */
  private show(source: PhotoSource | null) {
    const url = source && 'url' in source ? source.url : null;
    if (url) {
      if (this.img.getAttribute('src') !== url) this.img.src = url;
    } else this.img.removeAttribute('src');
    this.img.hidden = !url;
    this.note.hidden = !!url;
    this.note.textContent = url ? '' : NOTES[source && 'state' in source ? source.state : 'loading'];
    this.frame.classList.toggle('empty', !url);
  }

  /** A link that doesn't load: ours is asked for again (as offline); a pasted one says so. */
  private onError = () => {
    if (!this.img.getAttribute('src')) return;
    const id = mediaIdOf(this.src);
    if (id) return providePhoto(id, { state: 'offline' });
    this.img.removeAttribute('src');
    this.img.hidden = true;
    this.note.hidden = false;
    this.note.textContent = NOTES.broken;
    this.frame.classList.add('empty');
  };

  /** What carries the width: the photo itself when it floats or sits in a line, else its frame. */
  private sized() {
    return photoInfo(this.node).wrap === 'break' ? this.frame : this.dom;
  }

  /** What the width is a share of: the page, or the line. */
  private pageWidth() {
    return (photoInfo(this.node).wrap === 'break' ? this.dom : this.dom.parentElement)?.clientWidth || 1;
  }

  private startDrag(e: Event, clientX: number, sign: number) {
    if (!this.view.editable) return;
    // Not a text selection, nor (a finger) a scroll of the page.
    e.preventDefault();
    e.stopPropagation();
    this.drag = { startX: clientX, startWidth: this.sized().offsetWidth, page: this.pageWidth(), sign };
    this.dom.classList.add('resizing');
    window.addEventListener('mousemove', this.onDrag);
    window.addEventListener('mouseup', this.endDrag);
    window.addEventListener('touchmove', this.onDrag, { passive: false });
    window.addEventListener('touchend', this.endDrag);
    window.addEventListener('touchcancel', this.endDrag);
  }

  private onDrag = (e: MouseEvent | TouchEvent) => {
    const d = this.drag;
    if (!d) return;
    let x: number;
    if ('touches' in e) {
      if (!e.touches.length) return;
      e.preventDefault();
      x = e.touches[0].clientX;
    } else x = e.clientX;
    const px = Math.max(MIN_WIDTH_PX, Math.min(d.page, d.startWidth + d.sign * (x - d.startX)));
    this.sized().style.width = `${px}px`;
  };

  private endDrag = () => {
    const d = this.drag;
    this.drag = null;
    this.dom.classList.remove('resizing');
    this.stopListening();
    const pos = this.getPos();
    if (!d || pos === undefined) return;
    const width = clampPct((this.sized().offsetWidth / d.page) * 100);
    if (width === this.node.attrs.width) return this.render(this.node);
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, width });
    this.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
  };

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.render(node);
    return true;
  }

  stopEvent(e: Event) {
    return e.target instanceof HTMLElement && e.target.classList.contains(`${PHOTO_CLASS}-handle`);
  }

  ignoreMutation() {
    return true;
  }

  private stopListening() {
    window.removeEventListener('mousemove', this.onDrag);
    window.removeEventListener('mouseup', this.endDrag);
    window.removeEventListener('touchmove', this.onDrag);
    window.removeEventListener('touchend', this.endDrag);
    window.removeEventListener('touchcancel', this.endDrag);
  }

  destroy() {
    this.unwatch?.();
    this.stopListening();
  }
}

const sharedAttributes = {
  src: { default: null },
  alt: { default: null },
  title: { default: null },
  width: {
    default: null,
    parseHTML: parseWidth,
    renderHTML: (attrs: Record<string, unknown>) => (typeof attrs.width === 'number' ? { 'data-width': attrs.width, style: `width: ${attrs.width}%` } : {}),
  },
};

/** "In line with text": a photo inside a line, moving with the text around it. */
export const InlinePhoto = Node.create({
  name: INLINE_IMAGE,
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,

  addAttributes() {
    return sharedAttributes;
  },

  parseHTML() {
    // Before the block photo's rule (which takes every img).
    return [{ tag: 'img[data-inline][src]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { 'data-inline': '' })];
  },

  addNodeView() {
    return ({ node, view, getPos }) => new PhotoView(node, view, getPos);
  },

  addCommands() {
    return {
      placePhotoLine:
        (src, ms) =>
        ({ state, tr, dispatch, editor }) => {
          if (!dispatch) return true;
          const inline = photoLineInline(state.schema, src, ms);
          const touched = (editor.storage as unknown as Record<string, { touched?: boolean } | undefined>).markChip?.touched;
          const { $from } = state.selection;
          // Writing in the notes: a line of its own right after the one being written (an empty line is used),
          // after the photo lines already there (several photos at one moment stay in their order).
          if (touched && $from.parent.inlineContent && $from.depth >= 1) {
            if ($from.parent.content.size === 0) {
              tr.insert($from.pos, inline);
              return true;
            }
            let at = $from.after(1);
            for (let next = state.doc.nodeAt(at); next && isPhotoLine(next); next = state.doc.nodeAt(at)) at += next.nodeSize;
            tr.insert(at, state.schema.nodes.paragraph.create(null, inline));
            return true;
          }
          // Otherwise a new last line (an empty last line is used).
          const last = state.doc.lastChild;
          if (last?.type.name === 'paragraph' && last.content.size === 0) tr.insert(state.doc.content.size - 1, inline);
          else tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create(null, inline));
          return true;
        },
    };
  },
});

/** A board photo in My notes: a thumbnail, in % of the page (bigger from its menu). */
export const BOARD_PHOTO_WIDTH = 35;

/** A board photo's line (as placePhotoLine makes it): a paragraph starting with its time chip, with a photo in it. */
function isPhotoLine(node: PMNode): boolean {
  if (node.type.name !== 'paragraph' || node.firstChild?.type.name !== TIMESTAMP_CHIP) return false;
  let photo = false;
  node.forEach((child) => {
    if (child.type.name === INLINE_IMAGE) photo = true;
  });
  return photo;
}

/** A board photo's line: its time chip, a space, the photo as a thumbnail in the line. */
function photoLineInline(schema: Schema, src: string, ms: number): PMNode[] {
  return [schema.nodes[TIMESTAMP_CHIP].create({ ms: chipMs(ms) }), schema.text(' '), schema.nodes[INLINE_IMAGE].create({ src, width: BOARD_PHOTO_WIDTH })];
}

/**
 * My notes as JSON with a new last line for a board photo (its time, then the thumbnail), for one
 * taken while My notes isn't open (the laptop's strip is on every screen). An empty last line is used.
 */
export function withPhotoLine(doc: DocJSON, src: string, ms: number, now = Date.now()): DocJSON {
  const content = [...(doc.content ?? [])];
  const inline = [
    { type: TIMESTAMP_CHIP, attrs: { ms: chipMs(ms) } },
    { type: 'text', text: ' ' },
    { type: INLINE_IMAGE, attrs: { src, width: BOARD_PHOTO_WIDTH } },
  ];
  const last = content[content.length - 1];
  if (last?.type === 'paragraph' && !last.content?.length) content[content.length - 1] = { ...last, content: inline };
  else content.push({ type: 'paragraph', attrs: { blockId: newBlockId(), origin: 'student', editedAt: now }, content: inline });
  return { ...doc, content };
}

export const Photo = Image.extend({
  addOptions() {
    return { ...this.parent!(), inline: false, allowBase64: true, resize: false };
  },

  addAttributes() {
    return {
      ...sharedAttributes,
      wrap: {
        default: 'break',
        parseHTML: (el: HTMLElement) => (WRAPS.includes(el.getAttribute('data-wrap') as PhotoWrap) ? el.getAttribute('data-wrap') : 'break'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.wrap && attrs.wrap !== 'break' ? { 'data-wrap': attrs.wrap } : {}),
      },
      align: {
        default: 'left',
        parseHTML: (el: HTMLElement) => (ALIGNS.includes(el.getAttribute('data-align') as PhotoAlign) ? el.getAttribute('data-align') : 'left'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.align && attrs.align !== 'left' ? { 'data-align': attrs.align } : {}),
      },
    };
  },

  addNodeView() {
    return ({ node, view, getPos }) => new PhotoView(node, view, getPos);
  },

  addCommands() {
    return {
      ...this.parent?.(),
      insertPhotos:
        (srcs) =>
        ({ commands }) =>
          srcs.length > 0 && commands.insertContent(srcs.map((src) => ({ type: this.name, attrs: { src } }))),
      setPhotoWidth:
        (width) =>
        ({ state, tr, dispatch }) => {
          const { selection } = state;
          if (!(selection instanceof NodeSelection) || !isPhoto(selection.node)) return false;
          if (dispatch) {
            tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, width: width === null ? null : clampPct(width) });
            tr.setSelection(NodeSelection.create(tr.doc, selection.from));
          }
          return true;
        },
      removePhotos:
        (src) =>
        ({ state, tr, dispatch }) => {
          const found: { pos: number; size: number }[] = [];
          state.doc.descendants((node, pos) => {
            if (isPhoto(node) && node.attrs.src === src) found.push({ pos, size: node.nodeSize });
          });
          if (!found.length) return false;
          if (dispatch) {
            for (const f of found.reverse()) tr.delete(f.pos, f.pos + f.size);
            tr.setMeta('addToHistory', false);
          }
          return true;
        },
      setPhotoLayout:
        (layout) =>
        ({ state, tr, dispatch }) => {
          const found = selectedPhotoIn(state);
          if (!found) return false;
          if (dispatch) layoutPhoto(tr, found.pos, layout);
          return true;
        },
    };
  },
});
