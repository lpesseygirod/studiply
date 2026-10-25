import { courseCrumbs } from '../ShellContext';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

describe('courseCrumbs (the laptop top bar)', () => {
  it('course › folder › subfolder, each opening the course at that level', () => {
    expect(
      courseCrumbs('math', [
        { id: null, name: 'Math', type: 'project' },
        { id: 'f1', name: 'Funcions', type: 'folder' },
        { id: 'f2', name: 'Lineals', type: 'folder' },
      ]),
    ).toEqual([
      { label: 'Math', href: '/project/math' },
      { label: 'Funcions', href: { pathname: '/project/[id]', params: { id: 'math', folder: 'f1' } } },
      { label: 'Lineals', href: { pathname: '/project/[id]', params: { id: 'math', folder: 'f2' } } },
    ]);
  });

  it('a lecture outside any course sits in My library', () => {
    expect(courseCrumbs(null, [])).toEqual([{ label: 'My library', href: '/library' }]);
  });
});
