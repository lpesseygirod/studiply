/**
 * @jest-environment jsdom
 */
// Photos in documents (step 4.5): `media:<id>` sources resolved for each
// editor, and the photo node on a real editor (JSON, width, insert, remove,
// what the node view shows).
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat } from '../format';
import { mediaIdOf, mediaSrc, providePhoto, resetPhotoSources, RETRY_MS, setPhotoResolver, watchPhoto, type PhotoSource } from '../media/photoSource';
import { PHOTO_CLASS } from '../schema/photo';

let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
  resetPhotoSources();
  jest.useRealTimers();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('photo sources', () => {
  it('media:<id> is a photo of ours; other pictures are not', () => {
    expect(mediaSrc('m1')).toBe('media:m1');
    expect(mediaIdOf('media:m1')).toBe('m1');
    expect(mediaIdOf('https://example.com/a.png')).toBeNull();
    expect(mediaIdOf('media:')).toBeNull();
    expect(mediaIdOf(null)).toBeNull();
  });

  it('asks the resolver once and tells every watcher', async () => {
    const resolver = jest.fn(async (): Promise<PhotoSource> => ({ url: 'https://signed/m1' }));
    setPhotoResolver(resolver);
    const a: PhotoSource[] = [];
    const b: PhotoSource[] = [];
    watchPhoto('m1', (s) => a.push(s));
    watchPhoto('m1', (s) => b.push(s));
    await flush();
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(a).toEqual([{ url: 'https://signed/m1' }]);
    expect(b).toEqual([{ url: 'https://signed/m1' }]);
    // Known now: a new watcher gets it at once, without asking again.
    const c: PhotoSource[] = [];
    watchPhoto('m1', (s) => c.push(s));
    expect(c).toEqual([{ url: 'https://signed/m1' }]);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('the iPhone WebView: the resolver answers later through providePhoto', async () => {
    const asked: string[] = [];
    setPhotoResolver(async (id) => {
      asked.push(id);
      return null;
    });
    const seen: PhotoSource[] = [];
    watchPhoto('m2', (s) => seen.push(s));
    await flush();
    expect(asked).toEqual(['m2']);
    expect(seen).toEqual([]);
    providePhoto('m2', { url: 'data:image/jpeg;base64,AAAA' });
    expect(seen).toEqual([{ url: 'data:image/jpeg;base64,AAAA' }]);
  });

  it("a photo that can't show (offline, or not uploaded yet) is asked for again while on screen", async () => {
    jest.useFakeTimers();
    let online = false;
    const resolver = jest.fn(async (): Promise<PhotoSource> => (online ? { url: 'https://signed/m3' } : { state: 'offline' }));
    setPhotoResolver(resolver);
    const seen: PhotoSource[] = [];
    watchPhoto('m3', (s) => seen.push(s));
    await jest.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([{ state: 'offline' }]);
    online = true;
    await jest.advanceTimersByTimeAsync(RETRY_MS);
    expect(seen).toEqual([{ state: 'offline' }, { url: 'https://signed/m3' }]);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('nothing on screen: no asking again', async () => {
    jest.useFakeTimers();
    const resolver = jest.fn(async (): Promise<PhotoSource> => ({ state: 'offline' }));
    setPhotoResolver(resolver);
    const stop = watchPhoto('m4', () => {});
    await jest.advanceTimersByTimeAsync(0);
    stop();
    await jest.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('photos watched before there is a resolver are asked for once it is set', async () => {
    const seen: PhotoSource[] = [];
    watchPhoto('m5', (s) => seen.push(s));
    setPhotoResolver(async () => ({ url: 'https://signed/m5' }));
    await flush();
    expect(seen).toEqual([{ url: 'https://signed/m5' }]);
  });
});

describe('the photo node', () => {
  function open(content: JSONContent[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'Pizarra' }] }]) {
    editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content } });
    return editor;
  }
  const images = () => (editor!.getJSON().content ?? []).filter((n) => n.type === 'image');
  const imagePos = () => {
    let at = -1;
    editor!.state.doc.forEach((n, off) => {
      if (n.type.name === 'image' && at < 0) at = off;
    });
    return at;
  };
  const selectImage = () => editor!.view.dispatch(editor!.state.tr.setSelection(NodeSelection.create(editor!.state.doc, imagePos())));

  it('keeps media:<id> and the width in % through JSON and HTML', () => {
    open([{ type: 'image', attrs: { src: 'media:m1', width: 50 } }, { type: 'paragraph' }]);
    expect(images()[0].attrs).toMatchObject({ src: 'media:m1', width: 50 });
    const html = editor!.getHTML();
    expect(html).toContain('src="media:m1"');
    expect(html).toContain('data-width="50"');
    // Copied into another document (HTML), it is the same photo at the same size.
    const other = new Editor({ extensions: studiplyExtensions(), content: html });
    expect((other.getJSON().content ?? []).find((n) => n.type === 'image')?.attrs).toMatchObject({ src: 'media:m1', width: 50 });
    other.destroy();
  });

  it('a pasted picture with a width in px keeps its own size (width null)', () => {
    open();
    editor!.commands.setContent('<p>a</p><img src="https://example.com/a.png" width="300"><p>b</p>');
    expect(images()[0].attrs).toMatchObject({ src: 'https://example.com/a.png', width: null });
  });

  it('inserts photos where the cursor is, each a block', () => {
    open();
    editor!.commands.setTextSelection(8);
    editor!.commands.insertPhotos([mediaSrc('a'), mediaSrc('b')]);
    expect(images().map((n) => n.attrs?.src)).toEqual(['media:a', 'media:b']);
    expect(editor!.getJSON().content?.[0]).toMatchObject({ type: 'paragraph', content: [{ text: 'Pizarra' }] });
  });

  it('Small / Medium / Large / Full width on a selected photo (the iPhone), in the format state', () => {
    open([{ type: 'paragraph' }, { type: 'image', attrs: { src: 'media:m1' } }, { type: 'paragraph' }]);
    expect(formatState(editor!).photo).toBeNull();
    selectImage();
    expect(formatState(editor!).photo).toEqual({ width: null, wrap: 'break', align: 'left' });
    runFormat(editor!, { type: 'photoWidth', width: 25 });
    expect(images()[0].attrs?.width).toBe(25);
    // Still selected, so the next size applies to it too.
    expect(formatState(editor!).photo).toEqual({ width: 25, wrap: 'break', align: 'left' });
    runFormat(editor!, { type: 'photoWidth', width: 140 });
    expect(images()[0].attrs?.width).toBe(100);
  });

  describe('layout (after test B: as in Pages / Word)', () => {
    const photoNodes = () => {
      const out: JSONContent[] = [];
      const walk = (n: JSONContent) => {
        if (n.type === 'image' || n.type === 'inlineImage') out.push(n);
        (n.content ?? []).forEach(walk);
      };
      walk(editor!.getJSON());
      return out;
    };
    const layout = (wrap?: 'inline' | 'break' | 'left' | 'right', align?: 'left' | 'center' | 'right') => runFormat(editor!, { type: 'photoLayout', wrap, align });

    it('Break text with alignment, Wrap left / right: through JSON and HTML', () => {
      open([{ type: 'paragraph', content: [{ type: 'text', text: 'Antes' }] }, { type: 'image', attrs: { src: 'media:m1', width: 40 } }, { type: 'paragraph', content: [{ type: 'text', text: 'Texto que rodea la foto' }] }]);
      selectImage();
      layout(undefined, 'center');
      expect(photoNodes()[0].attrs).toMatchObject({ wrap: 'break', align: 'center', width: 40 });
      layout('right');
      expect(photoNodes()[0].attrs).toMatchObject({ wrap: 'right', width: 40 });
      expect(formatState(editor!).photo).toEqual({ width: 40, wrap: 'right', align: 'center' });
      const other = new Editor({ extensions: studiplyExtensions(), content: editor!.getHTML() });
      expect((other.getJSON().content ?? []).find((n) => n.type === 'image')?.attrs).toMatchObject({ wrap: 'right', align: 'center', width: 40 });
      other.destroy();
      // The node view floats it.
      expect(editor!.view.dom.querySelector<HTMLElement>(`.${PHOTO_CLASS}`)!.dataset.wrap).toBe('right');
    });

    it('wrapping a photo as wide as the page makes it half as wide (text needs room beside it)', () => {
      open([{ type: 'image', attrs: { src: 'media:m1' } }, { type: 'paragraph' }]);
      selectImage();
      layout('left');
      expect(photoNodes()[0].attrs).toMatchObject({ wrap: 'left', width: 50 });
    });

    it('In line with text: the photo goes into a line of its own, keeping its source and width; and back', () => {
      open([{ type: 'paragraph', content: [{ type: 'text', text: 'Antes' }] }, { type: 'image', attrs: { blockId: 'img', src: 'media:m1', width: 30 } }, { type: 'paragraph' }]);
      selectImage();
      layout('inline');
      const blocks = editor!.getJSON().content ?? [];
      expect(blocks[1]).toMatchObject({ type: 'paragraph', content: [{ type: 'inlineImage', attrs: { src: 'media:m1', width: 30 } }] });
      expect(formatState(editor!).photo).toEqual({ width: 30, wrap: 'inline', align: 'left' });
      // Type beside it.
      editor!.commands.setTextSelection(editor!.state.selection.to);
      editor!.commands.insertContent(' y texto');
      expect((editor!.getJSON().content ?? [])[1].content?.map((n) => n.type)).toEqual(['inlineImage', 'text']);
      // Back to Break text: before its paragraph, which keeps the text.
      let pos = -1;
      editor!.state.doc.descendants((n, p) => {
        if (n.type.name === 'inlineImage') pos = p;
      });
      editor!.view.dispatch(editor!.state.tr.setSelection(NodeSelection.create(editor!.state.doc, pos)));
      layout('break');
      const after = editor!.getJSON().content ?? [];
      expect(after.map((b) => b.type)).toEqual(['paragraph', 'image', 'paragraph', 'paragraph']);
      expect(after[1].attrs).toMatchObject({ src: 'media:m1', width: 30, wrap: 'break' });
      expect(JSON.stringify(after[2].content)).toContain(' y texto');
    });

    it('a photo alone in its line, set back to Break text, replaces that line', () => {
      open([{ type: 'paragraph', content: [{ type: 'inlineImage', attrs: { src: 'media:m1' } }] }, { type: 'paragraph', content: [{ type: 'text', text: 'b' }] }]);
      editor!.view.dispatch(editor!.state.tr.setSelection(NodeSelection.create(editor!.state.doc, 1)));
      layout('left');
      expect((editor!.getJSON().content ?? []).map((b) => b.type)).toEqual(['image', 'paragraph']);
    });

    it('size and delete work on a photo in a line too', () => {
      open([{ type: 'paragraph', content: [{ type: 'text', text: 'a ' }, { type: 'inlineImage', attrs: { src: 'media:m1' } }] }]);
      editor!.view.dispatch(editor!.state.tr.setSelection(NodeSelection.create(editor!.state.doc, 3)));
      runFormat(editor!, { type: 'photoWidth', width: 25 });
      expect(photoNodes()[0].attrs?.width).toBe(25);
      runFormat(editor!, { type: 'photoDelete' });
      expect(photoNodes()).toEqual([]);
    });
  });

  it('a photo that could not be uploaded is taken out, and Undo does not bring it back', () => {
    open([{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }]);
    editor!.commands.setTextSelection(2);
    editor!.commands.insertPhotos([mediaSrc('bad')]);
    expect(images()).toHaveLength(1);
    editor!.commands.removePhotos(mediaSrc('bad'));
    expect(images()).toHaveLength(0);
    editor!.commands.undo();
    expect(images()).toHaveLength(0);
  });

  it('the node view: "Loading photo…", then the picture; offline it says so', async () => {
    let answer: PhotoSource = { state: 'offline' };
    setPhotoResolver(async () => answer);
    open([{ type: 'image', attrs: { src: 'media:m9' } }, { type: 'paragraph' }]);
    const view = editor!.view.dom.querySelector(`.${PHOTO_CLASS}`)!;
    const img = view.querySelector('img')!;
    const note = view.querySelector(`.${PHOTO_CLASS}-note`)!;
    expect(note.textContent).toBe('Loading photo…');
    await flush();
    expect(note.textContent).toBe('Photo — shows when online');
    expect(img.hidden).toBe(true);
    answer = { url: 'https://signed/m9' };
    providePhoto('m9', answer);
    expect(img.getAttribute('src')).toBe('https://signed/m9');
    expect(img.hidden).toBe(false);
    expect((note as HTMLElement).hidden).toBe(true);
  });

  it('the node view shows a pasted picture from its own address, and the width as %', () => {
    open([{ type: 'image', attrs: { src: 'https://example.com/a.png', width: 75 } }, { type: 'paragraph' }]);
    const frame = editor!.view.dom.querySelector<HTMLElement>(`.${PHOTO_CLASS}-frame`)!;
    expect(frame.querySelector('img')!.getAttribute('src')).toBe('https://example.com/a.png');
    expect(frame.style.width).toBe('75%');
  });
});
