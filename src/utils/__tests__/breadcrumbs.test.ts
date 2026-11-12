import { withProjectRoot } from '../breadcrumbs';
import type { Breadcrumb } from '../../services/folder.service';

// Reproduces an earlier commit's test: courses Math and Science, folder
// Funcions in Math, Funcions moved to Science, Math renamed to History.

const funcions: Breadcrumb = { id: 'f1', name: 'Funcions', type: 'folder' };

describe('withProjectRoot', () => {
  it('starts with the project root on first load', () => {
    expect(withProjectRoot([], 'Math')).toEqual([{ id: null, name: 'Math', type: 'project' }]);
  });

  it('shows the new name after the project was renamed elsewhere', () => {
    const before = withProjectRoot([], 'Math');
    expect(withProjectRoot(before, 'History')[0].name).toBe('History');
  });

  it('keeps the folder the student is in while renaming the root', () => {
    const inside = [...withProjectRoot([], 'Math'), funcions];
    expect(withProjectRoot(inside, 'History')).toEqual([{ id: null, name: 'History', type: 'project' }, funcions]);
  });

  it("opening another project from a reset list shows that project's name", () => {
    // The screen clears its breadcrumbs when the project id changes.
    withProjectRoot([], 'Science');
    expect(withProjectRoot([], 'History')).toEqual([{ id: null, name: 'History', type: 'project' }]);
  });
});
