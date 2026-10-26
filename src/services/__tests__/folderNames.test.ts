// Folder names follow the same rule as lecture titles (step 3.2).
import { answer, callsOn, chains, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { createFolder, renameFolder } from '../folder.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);

const row = (name: string) => ({
  id: 'n', user_id: 'u', course_id: 'c', parent_id: null, name, sort_order: 0,
  starred_at: null, deleted_at: null, created_at: 'x', updated_at: 'x', changed_at: 'x',
});

beforeEach(() => resetSupabaseMock());

describe('folder names', () => {
  it('a new folder gets a clean name', async () => {
    answer('folders', { data: row('Tema 1') });
    await createFolder({ userId: 'u', projectId: 'c', name: '  Tema   1 ' });
    expect(callsOn('folders', 'insert')[0][0]).toMatchObject({ name: 'Tema 1', course_id: 'c', parent_id: null });
  });

  it('a bad name sends nothing', async () => {
    await expect(createFolder({ userId: 'u', projectId: 'c', name: '   ' })).rejects.toThrow('Enter a name.');
    await expect(renameFolder('n', 'x'.repeat(201))).rejects.toThrow('Use at most 200 characters.');
    expect(chains).toHaveLength(0);
  });

  it('renaming trims and returns the folder', async () => {
    answer('folders', { data: row('Apuntes') });
    const folder = await renameFolder('n', ' Apuntes ');
    expect(callsOn('folders', 'update')[0][0]).toEqual({ name: 'Apuntes' });
    expect(folder.name).toBe('Apuntes');
  });
});
