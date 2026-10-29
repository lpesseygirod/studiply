// The iPhone's keyboard toolbar (after test B): one row that never scrolls,
// fitted to the width, with an arrow for the second row; the chips for the
// link, comment, photo or maths at the cursor on a row of their own.
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { KeyboardToolbar } from '../iphone/KeyboardToolbar';
import type { FormatState } from '../format';

jest.mock('../iphone/keyboardAccessory', () => ({ useKeyboardAccessory: () => ({ onLayout: () => {} }) }));
// Icons need fonts Jest can't load; a placeholder is enough here.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

type Props = { accessibilityLabel?: unknown; accessibilityRole?: unknown; onLayout?: (e: unknown) => void; onPress?: () => void; style?: unknown };
const props = (n: { props: unknown }) => n.props as Props;
const labels = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof props(n).accessibilityLabel === 'string' && props(n).accessibilityRole === 'button' && typeof (n as unknown as { type: unknown }).type !== 'string').map((n) => props(n).accessibilityLabel as string);
const unique = (xs: string[]) => [...new Set(xs)];

let current: ReactTestRenderer | null = null;
// The open / closed row is remembered: each test starts closed.
beforeEach(() => AsyncStorage.clear());
afterEach(() => {
  act(() => current?.unmount());
  current = null;
});

async function render(state: Partial<FormatState> = {}, width = 330, withPhotos = true) {
  let r!: ReactTestRenderer;
  // Async: the remembered open / closed row loads from storage.
  await act(async () => {
    r = create(
      <KeyboardToolbar
        state={{ canUndo: true, canRedo: false, canIndent: true, canOutdent: false, ...state } as FormatState}
        run={() => {}}
        panel={undefined}
        onPanel={() => {}}
        onDone={() => {}}
        onLink={() => {}}
        onOpenLink={() => {}}
        onComment={() => {}}
        onPhotoLayout={() => {}}
        insert={{ photos: withPhotos ? () => {} : null, table: () => {}, formula: () => {}, comment: () => {} }}
      />,
    );
    await Promise.resolve();
  });
  // The tools' row measures its width.
  const row = r.root.findAll((n) => typeof props(n).onLayout === 'function' && !!props(n).style && JSON.stringify(props(n).style).includes('"flex":1'))[0];
  act(() => props(row).onLayout!({ nativeEvent: { layout: { width } } }));
  current = r;
  return r;
}

describe('the iPhone keyboard toolbar', () => {
  it('an iPhone width: the first tools in the row, the arrow, Done; the rest only when the arrow opens them, in named groups', async () => {
    const r = await render();
    const shown = unique(labels(r));
    expect(shown.slice(0, 6)).toEqual(['Text style and size', 'Bold', 'Italic', 'Underline', 'Text colour and highlight', 'Bulleted list']);
    expect(shown).toContain('More tools');
    expect(shown).toContain('Hide keyboard');
    expect(shown).not.toContain('Redo');
    const more = r.root.findAll((n) => props(n).accessibilityLabel === 'More tools' && typeof props(n).onPress === 'function')[0];
    await act(async () => props(more).onPress!());
    const open = unique(labels(r));
    expect(open).toContain('Fewer tools');
    // No "+" any more: what goes into the document is in the second row (Lea, after test C), with Undo and Redo last.
    expect(shown).not.toContain('Insert');
    const first = open.indexOf('Insert photo');
    expect(open.slice(first, first + 5)).toEqual(['Insert photo', 'Take photo', 'Insert table', 'Insert formula', 'Add comment']);
    expect(open.slice(first + 5, first + 7)).toEqual(['Undo', 'Redo']);
    // Each group has its title, each tool its name under it (the simplicity pass).
    const texts = r.root.findAll((n) => typeof (n as unknown as { type: unknown }).type === 'string' && typeof n.props.children === 'string').map((n) => n.props.children as string);
    for (const t of ['Format', 'Paragraph', 'Insert', 'Edit', 'Strike', 'Checklist', 'Indent −', 'Indent +', 'Photo', 'Camera', 'Table', 'Formula', 'Comment', 'Undo', 'Redo']) expect(texts).toContain(t);
  });

  it('wide enough for the whole first row (an iPhone on its side): Link fits; the arrow is still there for the rest', async () => {
    const r = await render({}, 900);
    const shown = unique(labels(r));
    expect(shown).toContain('Link');
    expect(shown).toContain('More tools');
    expect(shown).not.toContain('Insert table');
    expect(shown).not.toContain('Redo');
    const more = r.root.findAll((n) => props(n).accessibilityLabel === 'More tools' && typeof props(n).onPress === 'function')[0];
    await act(async () => props(more).onPress!());
    expect(unique(labels(r))).toContain('Insert table');
  });

  it("no photo buttons where photos can't be added", async () => {
    const r = await render({}, 900, false);
    const more = r.root.findAll((n) => props(n).accessibilityLabel === 'More tools' && typeof props(n).onPress === 'function')[0];
    await act(async () => props(more).onPress!());
    const open = unique(labels(r));
    expect(open).toContain('Insert formula');
    expect(open).not.toContain('Insert photo');
    expect(open).not.toContain('Take photo');
  });

  it('a selected photo, maths typed as text: their chips, on a row of their own', async () => {
    const shown = unique(labels(await render({ photo: { width: null, wrap: 'break', align: 'left' }, mathSuggestion: { latex: 'x^{2}' } })));
    expect(shown).toContain('Photo layout');
    expect(shown).toContain('Photo size medium');
    expect(shown).toContain('Make formula: x^{2}');
    // The tools keep their row.
    expect(shown).toContain('Bold');
  });
});
