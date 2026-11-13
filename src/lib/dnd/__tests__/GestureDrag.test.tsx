// The iPhone's drag and drop (GestureDrag.tsx), driven through its real
// gestures with gesture-handler's test utilities: hold and move onto a
// folder drops it there, hold and release shows the menu, a tap opens, a
// refused target gets no drop, and the list doesn't scroll on its own
// before the drag area has been measured (the iPhone drag bug).
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { DraggableView, edgeSpeed, GestureDragProvider, GestureDropTarget } from '../GestureDrag';
import type { Dragged, DropTarget } from '../rules';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light' } }));

// Where each view is on screen: the folders' drop targets by testID, everything else the whole screen.
const RECTS: Record<string, [number, number, number, number]> = {
  'drop-folder-a': [0, 100, 100, 100],
  'drop-folder-b': [200, 100, 100, 100],
};
type Measure = (cb: (x: number, y: number, w: number, h: number) => void) => void;

/**
 * React Native's Jest Views never answer measureInWindow (one shared
 * jest.fn on the prototype): give each View instance its own place.
 */
function placeViews(renderer: ReactTestRenderer) {
  for (const node of renderer.root.findAll((n) => typeof (n.instance as { measureInWindow?: unknown } | null)?.measureInWindow === 'function')) {
    const rect = RECTS[(node.props as { testID?: string }).testID ?? ''] ?? [0, 0, 400, 800];
    (node.instance as { measureInWindow: Measure }).measureInWindow = (cb) => cb(...rect);
  }
}

const place = (id: string, label: string): DropTarget => ({ id, kind: 'place', place: { courseId: 'math', folderId: id, label } });
const FOLDER_A = place('folder-a', 'Tema A');
const FOLDER_B = place('folder-b', 'Tema B');
const lecture: Dragged = { kind: 'item', item: { type: 'lecture', id: 'l1', title: 'Lecture 1', courseId: 'math', folderId: null } };

let mounted: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
});

function setup({ refuse = [] as string[] } = {}) {
  const onDrop = jest.fn();
  const onOpen = jest.fn();
  const onMenu = jest.fn();
  const check = jest.fn((_d: Dragged, t: DropTarget) => (refuse.includes(t.id) ? { ok: false as const, reason: 'No' } : { ok: true as const }));
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <GestureDragProvider check={check} onDrop={onDrop}>
        <GestureDropTarget target={FOLDER_A}>{() => <Text>Tema A</Text>}</GestureDropTarget>
        <GestureDropTarget target={FOLDER_B}>{() => <Text>Tema B</Text>}</GestureDropTarget>
        <DraggableView dragged={lecture} onOpen={onOpen} onMenu={onMenu} accessibilityLabel="Lecture 1">
          <Text>Lecture 1</Text>
        </DraggableView>
      </GestureDragProvider>,
    );
  });
  placeViews(renderer);
  mounted = renderer;
  return { onDrop, onOpen, onMenu, check };
}

/** Hold the lecture at (300, 500), then move to `to` and let go. */
async function holdAndMove(to: { x: number; y: number }) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('drag-l1'), [
      { state: State.BEGAN, absoluteX: 300, absoluteY: 500, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, absoluteX: 300, absoluteY: 500, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, absoluteX: to.x, absoluteY: to.y, translationX: to.x - 300, translationY: to.y - 500 },
      { state: State.END, absoluteX: to.x, absoluteY: to.y, translationX: to.x - 300, translationY: to.y - 500 },
    ]);
  });
}

describe('GestureDrag (iPhone)', () => {
  it('hold and move onto a folder drops it there, even when let go at once', async () => {
    const { onDrop, onMenu } = setup();
    await holdAndMove({ x: 50, y: 150 });
    expect(onDrop).toHaveBeenCalledWith(lecture, expect.objectContaining({ id: 'folder-a' }));
    expect(onMenu).not.toHaveBeenCalled();
  });

  it('the innermost target under the finger is the one', async () => {
    const { onDrop } = setup();
    await holdAndMove({ x: 250, y: 120 });
    expect(onDrop).toHaveBeenCalledWith(lecture, expect.objectContaining({ id: 'folder-b' }));
  });

  it('nowhere near a target: no drop', async () => {
    const { onDrop } = setup();
    await holdAndMove({ x: 150, y: 600 });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('a refused target gets no drop', async () => {
    const { onDrop, check } = setup({ refuse: ['folder-a'] });
    await holdAndMove({ x: 50, y: 150 });
    expect(check).toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('hold and release without moving shows the menu, nothing moves', async () => {
    const { onDrop, onMenu } = setup();
    await act(async () => {
      fireGestureHandler(getByGestureTestId('drag-l1'), [
        { state: State.BEGAN, absoluteX: 300, absoluteY: 500, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, absoluteX: 300, absoluteY: 500, translationX: 0, translationY: 0 },
        { state: State.END, absoluteX: 302, absoluteY: 501, translationX: 2, translationY: 1 },
      ]);
    });
    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('a tap opens', async () => {
    const { onOpen } = setup();
    await act(async () => {
      fireGestureHandler(getByGestureTestId('tap-l1'), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]);
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('edgeSpeed (auto-scroll near the edges)', () => {
  it('nothing until the drag area has been measured', () => {
    expect(edgeSpeed(5, 0, 0)).toBe(0);
    expect(edgeSpeed(500, 0, 0)).toBe(0);
  });

  it('up near the top, down near the bottom, faster closer to the edge, none in the middle', () => {
    expect(edgeSpeed(400, 0, 800)).toBe(0);
    expect(edgeSpeed(0, 0, 800)).toBeLessThan(edgeSpeed(60, 0, 800));
    expect(edgeSpeed(60, 0, 800)).toBeLessThan(0);
    expect(edgeSpeed(800, 0, 800)).toBeGreaterThan(edgeSpeed(740, 0, 800));
    expect(edgeSpeed(740, 0, 800)).toBeGreaterThan(0);
  });

  it('counts from where the drag area starts', () => {
    expect(edgeSpeed(150, 100, 700)).toBeLessThan(0);
    expect(edgeSpeed(150, 0, 800)).toBe(0);
  });
});
