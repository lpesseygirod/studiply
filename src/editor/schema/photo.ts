import type { Editor } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView, NodeView } from '@tiptap/pm/view';

import { mediaIdOf, providePhoto, watchPhoto, type PhotoSource } from '../media/photoSource';

/**
 * Photos in documents (step 4.5), in place of TenTap's plain image: still
 * the `image` node (pasted pictures stay pictures), with
 * - `src` `media:<id>` for a photo added in Studiply (see media/photoSource),
 *   or a pasted picture's own address;
 * - `width` in % of the page, so a photo is as wide on the iPhone as on the
 *   laptop (null: its own size, at most the page's width).
 *
 * The node view shows the picture once resolved ("Loading photo…", or why it
 * can't show), and on a laptop (a mouse) handles on the corners of a
 * selected photo drag its width. The iPhone sets Small / Medium / Large /
 * Full width from the keyboard toolbar (`setPhotoWidth`).
 */

export const PHOTO_CLASS = 'studiply-photo';
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
    };
  }
}

const NOTES: Record<'loading' | 'offline' | 'missing' | 'broken', string> = {
  loading: 'Loading photo…',
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

/** The selected photo, if the selection is one. */
export function selectedPhoto(editor: Editor): { width: number | null } | null {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return null;
  const width = selection.node.attrs.width;
  return { width: typeof width === 'number' ? width : null };
}

class PhotoView implements NodeView {
  dom = document.createElement('div');
  private frame = document.createElement('div');
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
    this.dom.className = PHOTO_CLASS;
    this.frame.className = `${PHOTO_CLASS}-frame`;
    this.note.className = `${PHOTO_CLASS}-note`;
    this.img.draggable = false;
    this.img.addEventListener('error', this.onError);
    this.frame.append(this.img, this.note);
    // Handles need a mouse; on the iPhone the keyboard toolbar sets the size.
    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches) {
      for (const corner of ['nw', 'ne', 'sw', 'se']) {
        const handle = document.createElement('span');
        handle.className = `${PHOTO_CLASS}-handle`;
        handle.dataset.corner = corner;
        handle.setAttribute('aria-label', 'Resize photo');
        handle.addEventListener('mousedown', (e) => this.startDrag(e, corner.endsWith('w') ? -1 : 1));
        this.frame.appendChild(handle);
      }
    }
    this.dom.appendChild(this.frame);
    this.render(node);
  }

  private render(node: PMNode) {
    this.node = node;
    const { src, alt, width } = node.attrs;
    this.img.alt = typeof alt === 'string' ? alt : '';
    this.frame.style.width = typeof width === 'number' ? `${width}%` : '';
    this.frame.classList.toggle('sized', typeof width === 'number');
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

  private startDrag(e: MouseEvent, sign: number) {
    if (!this.view.editable) return;
    e.preventDefault();
    e.stopPropagation();
    this.drag = { startX: e.clientX, startWidth: this.frame.offsetWidth, page: this.dom.clientWidth || 1, sign };
    this.dom.classList.add('resizing');
    window.addEventListener('mousemove', this.onDrag);
    window.addEventListener('mouseup', this.endDrag);
  }

  private onDrag = (e: MouseEvent) => {
    const d = this.drag;
    if (!d) return;
    const px = Math.max(MIN_WIDTH_PX, Math.min(d.page, d.startWidth + d.sign * (e.clientX - d.startX)));
    this.frame.style.width = `${px}px`;
  };

  private endDrag = () => {
    const d = this.drag;
    this.drag = null;
    this.dom.classList.remove('resizing');
    window.removeEventListener('mousemove', this.onDrag);
    window.removeEventListener('mouseup', this.endDrag);
    const pos = this.getPos();
    if (!d || pos === undefined) return;
    const width = clampPct((this.frame.offsetWidth / d.page) * 100);
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

  destroy() {
    this.unwatch?.();
    window.removeEventListener('mousemove', this.onDrag);
    window.removeEventListener('mouseup', this.endDrag);
  }
}

export const Photo = Image.extend({
  addOptions() {
    return { ...this.parent!(), inline: false, allowBase64: true, resize: false };
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: parseWidth,
        renderHTML: (attrs: Record<string, unknown>) =>
          typeof attrs.width === 'number' ? { 'data-width': attrs.width, style: `width: ${attrs.width}%` } : {},
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
          if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) return false;
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
            if (node.type.name === this.name && node.attrs.src === src) found.push({ pos, size: node.nodeSize });
          });
          if (!found.length) return false;
          if (dispatch) {
            for (const f of found.reverse()) tr.delete(f.pos, f.pos + f.size);
            tr.setMeta('addToHistory', false);
          }
          return true;
        },
    };
  },
});
