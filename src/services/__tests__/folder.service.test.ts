// What folder.service sends to Supabase. The database's own rules (course
// follows the parent, subtrees move along, no cycles) are tested in
// supabase/tests/database/02_rules and 04_library_moves.
// (jest.mock below is hoisted above this import.)

import { moveFolder, renameFolder } from '../folder.service';

const mockCalls: { table: string; update?: unknown; eq?: [string, unknown] }[] = [];
let mockNextError: { code: string; message: string } | null = null;

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call: { table: string; update?: unknown; eq?: [string, unknown] } = { table };
      mockCalls.push(call);
      return {
        update(patch: unknown) {
          call.update = patch;
          return {
            eq: (column: string, value: unknown) => {
              call.eq = [column, value];
              const result = { error: mockNextError };
              // awaited directly (moveFolder) or with .select('*').single() (renameFolder)
              return {
                then: (resolve: (r: unknown) => void) => resolve(result),
                select: () => ({
                  single: async () => ({
                    data: mockNextError ? null : { id: value, name: (patch as { name?: string }).name, course_id: 'c', parent_id: null },
                    error: mockNextError,
                  }),
                }),
              };
            },
          };
        },
      };
    },
  },
}));

const MATH = 'c-math';
const SCIENCE = 'c-science';
const FUNCIONS = 'f-funcions';

beforeEach(() => {
  mockCalls.length = 0;
  mockNextError = null;
});

describe('moveFolder', () => {
  it('moving a folder to the top of another course sends that course', async () => {
    await moveFolder(FUNCIONS, null, SCIENCE);
    expect(mockCalls).toEqual([{ table: 'folders', update: { parent_id: null, course_id: SCIENCE }, eq: ['id', FUNCIONS] }]);
  });

  it('moving into a folder sends the course too (the database takes the parent folder’s)', async () => {
    await moveFolder(FUNCIONS, 'f-target', SCIENCE);
    expect(mockCalls[0].update).toEqual({ parent_id: 'f-target', course_id: SCIENCE });
  });

  it('without a project only the parent changes', async () => {
    await moveFolder(FUNCIONS, null);
    expect(mockCalls[0].update).toEqual({ parent_id: null });
  });

  it('refuses a move into itself without calling the database', async () => {
    await expect(moveFolder(FUNCIONS, FUNCIONS, MATH)).rejects.toThrow("can't be moved into itself");
    expect(mockCalls).toHaveLength(0);
  });

  it('shows the cycle refusal from the database as a plain message', async () => {
    mockNextError = { code: '23514', message: 'A folder cannot be moved into itself or one of its subfolders' };
    await expect(moveFolder(FUNCIONS, 'f-child', MATH)).rejects.toThrow("can't be moved into one of its own subfolders");
  });
});

describe('renameFolder', () => {
  it('renames only the folder it was given', async () => {
    await renameFolder(FUNCIONS, 'Funciones');
    expect(mockCalls).toEqual([{ table: 'folders', update: { name: 'Funciones' }, eq: ['id', FUNCIONS] }]);
  });
});

