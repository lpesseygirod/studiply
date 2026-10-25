import { OVERLAP_MS, PAGE, pullTable, transcriptsToFetch, type PullTableDeps } from '../pull';

type Row = { id: string; user_id: string; updated_at: string };
const row = (id: string, updated_at: string): Row => ({ id, user_id: 'u', updated_at });

function fakeTable(server: Row[], cached: Row[], dirty: string[] = [], since: string | null = null) {
  const store = new Map(cached.map((r) => [r.id, r]));
  const state = { since, sinceAsked: [] as (string | null)[] };
  const deps: PullTableDeps<Row> = {
    fetchChanged: async (s, from, to) => {
      state.sinceAsked.push(s);
      return server
        .filter((r) => !s || r.updated_at >= s)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        .slice(from, to + 1);
    },
    fetchIds: async (from, to) => server.map((r) => ({ id: r.id })).slice(from, to + 1),
    cachedIds: async () => [...store.keys()],
    dirtyIds: async () => new Set(dirty),
    save: async (rows) => rows.forEach((r) => store.set(r.id, r)),
    drop: async (ids) => ids.forEach((id) => store.delete(id)),
    getSince: async () => state.since,
    setSince: async (s) => {
      state.since = s;
    },
  };
  return { deps, store, state };
}

describe('pullTable', () => {
  it('downloads everything the first time and remembers the newest updated_at', async () => {
    const { deps, store, state } = fakeTable([row('a', '2026-10-01T10:00:00.000Z'), row('b', '2026-10-02T10:00:00.000Z')], []);
    expect(await pullTable(deps)).toBe(2);
    expect([...store.keys()].sort()).toEqual(['a', 'b']);
    expect(state.sinceAsked[0]).toBeNull();
    expect(state.since).toBe('2026-10-02T10:00:00.000Z');
  });

  it('then asks only for rows since the last pull, a minute back', async () => {
    const { deps, state } = fakeTable([row('a', '2026-10-02T10:00:00.000Z')], [], [], '2026-10-02T10:00:00.000Z');
    await pullTable(deps);
    expect(state.sinceAsked[0]).toBe(new Date(Date.parse('2026-10-02T10:00:00.000Z') - OVERLAP_MS).toISOString());
  });

  it('drops rows deleted on another device', async () => {
    const { deps, store } = fakeTable([row('kept', '2026-10-01T10:00:00.000Z')], [row('kept', '2026-10-01T10:00:00.000Z'), row('gone', '2026-10-01T10:00:00.000Z')]);
    await pullTable(deps);
    expect([...store.keys()]).toEqual(['kept']);
  });

  it('never replaces or drops a row changed on this iPhone that has not synced', async () => {
    const mine = { ...row('edited', '2026-10-01T10:00:00.000Z'), local: true } as Row;
    const created = row('created-offline', '2026-10-03T10:00:00.000Z');
    const { deps, store } = fakeTable(
      [row('edited', '2026-10-05T10:00:00.000Z')],
      [mine, created],
      ['edited', 'created-offline'],
    );
    await pullTable(deps);
    expect(store.get('edited')).toBe(mine);
    expect(store.get('created-offline')).toBe(created);
  });

  it('reads every page of a large table', async () => {
    const server = Array.from({ length: PAGE + 5 }, (_, i) =>
      row(`r${i}`, new Date(Date.UTC(2026, 9, 1) + i * 1000).toISOString()),
    );
    const { deps, store } = fakeTable(server, []);
    await pullTable(deps);
    expect(store.size).toBe(PAGE + 5);
  });

  it('keeps the watermark when nothing changed', async () => {
    const { deps, state } = fakeTable([], [], [], '2026-10-02T10:00:00.000Z');
    expect(await pullTable(deps)).toBe(0);
    expect(state.since).toBe('2026-10-02T10:00:00.000Z');
  });
});

describe('transcriptsToFetch', () => {
  const lectures = [
    { id: 'new', status: 'ready', updated_at: '2026-10-05T00:00:00.000Z' },
    { id: 'cached', status: 'ready', updated_at: '2026-10-04T00:00:00.000Z' },
    { id: 'changed', status: 'ready', updated_at: '2026-10-03T00:00:00.000Z' },
    { id: 'recording', status: 'recording', updated_at: '2026-10-06T00:00:00.000Z' },
    { id: 'oldest', status: 'ready', updated_at: '2026-10-01T00:00:00.000Z' },
  ];
  const fetchedAt = new Map([
    ['cached', '2026-10-04T12:00:00.000Z'],
    ['changed', '2026-10-02T00:00:00.000Z'],
  ]);

  it('recent finished lectures without a cached transcript, or changed since', () => {
    expect(transcriptsToFetch(lectures, fetchedAt, 3)).toEqual(['new', 'changed']);
    expect(transcriptsToFetch(lectures, fetchedAt, 10)).toEqual(['new', 'changed', 'oldest']);
  });
});
