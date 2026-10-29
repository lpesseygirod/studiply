// The iPhone's keyboard toolbar (after test B): one row that never scrolls,
// fitted to the width, with an arrow for the second row; the chips for the
// link, comment, photo or maths at the cursor on a row of their own.
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { KeyboardToolbar } from '../iphone/KeyboardToolbar';
import type { FormatState } from '../format';

jest.mock('@10play/tentap-editor', () => ({ useKeyboardAccessory: () => ({ onLayout: () => {} }) }));
// Icons need fonts Jest can't load; a placeholder is enough here.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

type Props = { accessibilityLabel?: unknown; accessibilityRole?: unknown; onLayout?: (e: unknown) => void; onPress?: () => void; style?: unknown };
const props = (n: { props: unknown }) => n.props as Props;
const labels = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof props(n).accessibilityLabel === 'string' && props(n).accessibilityRole === 'button' && typeof (n as unknown as { type: unknown }).type !== 'string').map((n) => props(n).accessibilityLabel as string);
const unique = (xs: string[]) => [...new Set(xs)];

let current: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => current?.unmount());
  current = null;
});

async function render(state: Partial<FormatState> = {}, width = 330) {
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
  it('an iPhone width: the first tools in the row, the arrow, Done; the rest only when the arrow opens them', async () => {
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
    expect(open).toContain('Undo');
    expect(open).toContain('Redo');
    expect(open).toContain('Insert');
  });

  it('wide enough for everything (an iPhone on its side): no arrow', async () => {
    const shown = unique(labels(await render({}, 900)));
    expect(shown).not.toContain('More tools');
    expect(shown).toContain('Redo');
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
