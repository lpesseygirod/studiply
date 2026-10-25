// New courses follow the one name rule (step 3.2).
import { answer, callsOn, chains, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { createProject, updateProject } from '../project.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);

beforeEach(() => resetSupabaseMock());

describe('createProject (New course)', () => {
  it('sends a clean name and the chosen colour', async () => {
    answer('courses', { data: { id: 'c', user_id: 'u', name: 'Psicobiología', color: '#D8D5F0', icon: 'folder', sort_order: 0, is_archived: false, starred_at: null, deleted_at: null, created_at: 'x', updated_at: 'x', changed_at: 'x' } });
    const course = await createProject('u', '  Psicobiología ', '#D8D5F0');
    expect(callsOn('courses', 'insert')[0][0]).toEqual({ name: 'Psicobiología', color: '#D8D5F0', icon: 'folder' });
    expect(course.name).toBe('Psicobiología');
  });

  it('refuses an empty or too long name without sending anything', async () => {
    await expect(createProject('u', '  ')).rejects.toThrow('Enter a name.');
    await expect(createProject('u', 'x'.repeat(201))).rejects.toThrow('Use at most 200 characters.');
    expect(chains).toHaveLength(0);
  });
});

describe('updateProject (Rename… from any menu)', () => {
  it('sends the clean name and leaves the other columns out', async () => {
    answer('courses', { data: { id: 'c', user_id: 'u', name: 'Math II', color: '#D8D5F0', icon: 'folder', sort_order: 0, is_archived: false, starred_at: null, deleted_at: null, created_at: 'x', updated_at: 'x', changed_at: 'x' } });
    await updateProject('c', { name: ' Math   II ' });
    expect(callsOn('courses', 'update')[0][0]).toEqual({ name: 'Math II', color: undefined, icon: undefined, sort_order: undefined });
  });

  it('refuses an empty name without sending anything', async () => {
    await expect(updateProject('c', { name: ' ' })).rejects.toThrow('Enter a name.');
    expect(chains).toHaveLength(0);
  });
});
