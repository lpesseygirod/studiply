// MoveToModal as "New folder in…" (Lea, 10 Nov): its confirm buttons say "Create here" (Move to…
// keeps "Move" / "Move to <place>"), and with no course at all it says "Make a course first" with a
// New course button instead of "No courses yet.".
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import MoveToModal from '../MoveToModal';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../../services/project.service', () => ({ getProjects: jest.fn() }));
jest.mock('../../services/folder.service', () => ({ getFolders: jest.fn(async () => []) }));
jest.mock('../../services/session.service', () => ({ getSessionsByProject: jest.fn(async () => []) }));

const projects = jest.requireMock('../../services/project.service') as { getProjects: jest.Mock };

type Node = ReactTestRenderer['root'];
type Pressable = { props: { onPress?: () => void; disabled?: boolean } };
const textOf = (t: Node) => [t.props.children].flat().join('');
const textsIn = (n: Node) => n.findAll((m: Node) => (m as unknown as { type: unknown }).type === Text);
const texts = (r: ReactTestRenderer): string[] => textsIn(r.root).map(textOf);
/** The touchable whose own text is `label`. */
const button = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n: Node) => typeof n.props.onPress === 'function' && textsIn(n).some((t: Node) => textOf(t) === label))[0] as unknown as Pressable;

let current: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => current?.unmount());
  current = null;
});

async function render(props: Partial<React.ComponentProps<typeof MoveToModal>> = {}) {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(<MoveToModal visible userId="u1" onClose={() => {}} {...props} />);
  });
  current = r;
  return r;
}

describe('New folder in…', () => {
  it('no course yet: "Make a course first" and New course', async () => {
    projects.getProjects.mockResolvedValue([]);
    const onPress = jest.fn();
    const r = await render({ title: 'New folder in…', confirmText: 'Create here', emptyAction: { message: 'Make a course first', button: 'New course', onPress } });
    expect(texts(r)).toContain('Make a course first');
    expect(texts(r)).not.toContain('No courses yet.');
    act(() => button(r, 'New course').props.onPress?.());
    expect(onPress).toHaveBeenCalled();
  });

  it('in a course: both confirm buttons say Create here, and it gives the place', async () => {
    projects.getProjects.mockResolvedValue([{ id: 'k1', name: 'Math' }]);
    const onMove = jest.fn();
    const r = await render({ title: 'New folder in…', confirmText: 'Create here', onMove });
    // At the top, nothing to create in yet.
    expect(texts(r)).toContain('Choose a course or folder');
    await act(async () => button(r, 'Math').props.onPress?.());
    expect(texts(r).filter((t) => t === 'Create here')).toHaveLength(2);
    act(() => button(r, 'Create here').props.onPress?.());
    expect(onMove).toHaveBeenCalledWith({ projectId: 'k1', folderId: null, label: 'Math' });
  });
});

describe('Move to… unchanged', () => {
  it('"Move" and "Move to <place>"; no courses: "No courses yet."', async () => {
    projects.getProjects.mockResolvedValue([{ id: 'k1', name: 'Math' }]);
    const r = await render();
    await act(async () => button(r, 'Math').props.onPress?.());
    expect(texts(r)).toEqual(expect.arrayContaining(['Move', 'Move to Math']));
    projects.getProjects.mockResolvedValue([]);
    const empty = await render();
    expect(texts(empty)).toContain('No courses yet.');
  });
});
