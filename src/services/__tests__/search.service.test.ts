// Search online: the database's search_library, mapped to hits.
import { reportReachable, resetConnectivityForTests } from '../../lib/connectivity';
import { answer, callsOn, chains, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { searchLibrary } from '../search.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);

beforeEach(() => {
  resetSupabaseMock();
  resetConnectivityForTests();
  reportReachable();
});

describe('searchLibrary', () => {
  it('asks the database, and maps its rows', async () => {
    answer('rpc:search_library', {
      data: [
        {
          kind: 'transcript', item_id: 'l1', file_kind: 'lecture', course_id: 'bio', folder_id: 'f1',
          course_name: 'Biología', course_color: '#2E7D32', title: 'Clase 4',
          matched: 'El parentesco filogenético.', field: 'transcript', t_ms: 1102000, rank: 1.05,
        },
        {
          kind: 'course', item_id: 'c2', file_kind: null, course_id: 'c2', folder_id: null,
          course_name: 'Filogenia', course_color: null, title: 'Filogenia', matched: null, field: 'title', t_ms: null, rank: 3.5,
        },
      ],
    });
    const answerFound = await searchLibrary('  filogenetico ');
    expect(callsOn('rpc:search_library', 'args')).toEqual([[{ q: 'filogenetico', max_results: 60 }]]);
    expect(answerFound.offline).toBe(false);
    expect(answerFound.hits[0]).toEqual({
      kind: 'transcript', itemId: 'l1', fileKind: 'lecture', courseId: 'bio', folderId: 'f1',
      courseName: 'Biología', courseColor: '#2E7D32', title: 'Clase 4',
      matched: 'El parentesco filogenético.', field: 'transcript', tMs: 1102000, rank: 1.05,
    });
    expect(answerFound.hits[1].matched).toBe('');
  });

  it('doesn\'t search under 2 letters', async () => {
    expect(await searchLibrary(' f ')).toEqual({ hits: [], offline: false });
    expect(chains).toHaveLength(0);
  });

  it('says when the search failed', async () => {
    answer('rpc:search_library', { error: { message: 'boom', code: 'XX000' } });
    await expect(searchLibrary('filo')).rejects.toThrow('Search failed. Please try again.');
  });
});
