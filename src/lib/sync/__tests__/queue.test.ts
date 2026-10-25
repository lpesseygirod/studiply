import { NetworkError } from '../../cloudRows';
import { createMemoryStore } from '../memoryStore';
import {
  classify,
  createSyncQueue,
  describeError,
  PermanentSyncError,
  SyncHttpError,
  type SyncEvent,
  type SyncHandler,
} from '../queue';

type Payload = { value: string };

/** A test rig: a clock, timers that run when told, and a fake server. */
function rig(opts: { online?: boolean } = {}) {
  const store = createMemoryStore();
  const state = {
    now: Date.parse('2026-10-25T10:00:00.000Z'),
    online: opts.online ?? true,
    user: 'u1' as string | null,
    timers: [] as { at: number; fn: () => void }[],
    sent: [] as string[],
    /** Rows on the "server", written with upsert semantics. */
    server: new Map<string, string>(),
    failNext: [] as unknown[],
    /** The next run never answers (a hung request). */
    hangNext: false,
    refreshOk: true,
    refreshCalls: 0,
  };
  let ids = 0;

  const write: SyncHandler<Payload> = {
    run: async (p) => {
      if (state.hangNext) {
        state.hangNext = false;
        return new Promise<void>(() => {});
      }
      const err = state.failNext.shift();
      if (err) throw err;
      state.sent.push(p.value);
      state.server.set(p.value, p.value);
    },
    merge: (a, b) => ({ value: `${a.value}+${b.value}` }),
  };
  const plain: SyncHandler<Payload> = { run: write.run };

  const handlers: Record<string, SyncHandler<Payload>> = { write, plain };

  const make = () =>
    createSyncQueue({
      store,
      handlers,
      userId: () => state.user,
      canSync: () => state.online,
      refresh: async () => {
        state.refreshCalls++;
        return state.refreshOk;
      },
      newId: () => `op${++ids}`,
      now: () => state.now,
      random: () => 0,
      setTimer: (fn, ms) => {
        const t = { at: state.now + ms, fn };
        state.timers.push(t);
        return t;
      },
      clearTimer: (t) => {
        state.timers = state.timers.filter((x) => x !== t);
      },
    });

  /** Moves the clock and runs the timers that are due. */
  async function advance(ms: number) {
    state.now += ms;
    const due = state.timers.filter((t) => t.at <= state.now);
    state.timers = state.timers.filter((t) => t.at > state.now);
    for (const t of due) t.fn();
    await settle();
  }

  return { store, state, make, advance, handlers, plain };
}

/** Lets fire-and-forget flushes finish. */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('sync queue', () => {
  it('sends operations in the order they were made', async () => {
    const { state, make } = rig({ online: false });
    const q = make();
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    await q.enqueue({ kind: 'plain', key: 'b', payload: { value: '2' } });
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '3' } });
    expect(state.sent).toEqual([]);

    state.online = true;
    await q.flush();
    expect(state.sent).toEqual(['1', '2', '3']);
    expect(await q.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('a lost connection stops the flush; the same operation goes first next time', async () => {
    const { state, make, store } = rig({ online: false });
    const q = make();
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    await q.enqueue({ kind: 'plain', key: 'b', payload: { value: '2' } });

    state.online = true;
    state.failNext = [new NetworkError()];
    await q.flush();
    expect(state.sent).toEqual([]);
    expect(store.ops.map((o) => o.payload)).toEqual([{ value: '1' }, { value: '2' }]);
    expect(store.ops[0].attempts).toBe(1);

    // Not before the backoff…
    await q.flush();
    expect(state.sent).toEqual([]);
    // …then in the original order.
    state.now += 1000;
    await q.flush();
    expect(state.sent).toEqual(['1', '2']);
  });

  it('waits 1 s, 2 s, 4 s … between tries, capped at 5 minutes, and retries on its own', async () => {
    const { state, make, store, advance } = rig();
    const q = make();
    state.failNext = [new SyncHttpError('busy', 503), new SyncHttpError('busy', 503), new SyncHttpError('busy', 503)];
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    await settle();

    const waits: number[] = [];
    for (let i = 0; i < 3; i++) {
      const op = store.ops[0];
      if (!op) break;
      const wait = Date.parse(op.nextAttemptAt as string) - state.now;
      waits.push(wait);
      await advance(wait);
    }
    expect(waits).toEqual([1000, 2000, 4000]);
    expect(state.sent).toEqual(['1']);

    const r = rig();
    const q2 = r.make();
    r.state.failNext = Array.from({ length: 12 }, () => new NetworkError());
    await q2.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    for (let i = 0; i < 11; i++) await r.advance(10 * 60_000);
    const last = r.store.ops[0];
    expect(Date.parse(last.nextAttemptAt as string) - r.state.now).toBeLessThanOrEqual(5 * 60_000);
    expect(last.status).toBe('pending');
  });

  it('refreshes the session after a 401 and tries again at once', async () => {
    const { state, make } = rig();
    const q = make();
    state.failNext = [new SyncHttpError('expired', 401)];
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    await settle();
    expect(state.refreshCalls).toBe(1);
    expect(state.sent).toEqual(['1']);
  });

  it('a 401 that the refresh cannot fix waits like a lost connection', async () => {
    const { state, make, store } = rig();
    const q = make();
    state.refreshOk = false;
    state.failNext = [new SyncHttpError('expired', 401)];
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    await settle();
    expect(store.ops[0].status).toBe('pending');
    expect(store.ops[0].nextAttemptAt).not.toBeNull();
  });

  it('a refused operation is kept as failed and blocks only its own key', async () => {
    const { state, make, store } = rig({ online: false });
    const q = make();
    await q.enqueue({ kind: 'plain', key: 'lecture-1', payload: { value: 'create' } });
    await q.enqueue({ kind: 'plain', key: 'lecture-2', payload: { value: 'other' } });
    await q.enqueue({ kind: 'plain', key: 'lecture-1', payload: { value: 'upload' } });

    const events: SyncEvent[] = [];
    q.subscribe((e) => events.push(e));
    state.online = true;
    state.failNext = [new PermanentSyncError('This lecture was deleted on another device.')];
    await q.flush();

    expect(state.sent).toEqual(['other']);
    expect(store.ops.map((o) => [o.payload, o.status])).toEqual([
      [{ value: 'create' }, 'failed'],
      [{ value: 'upload' }, 'pending'],
    ]);
    expect(store.ops[0].lastError).toBe('This lecture was deleted on another device.');
    expect(events.some((e) => e.type === 'failed')).toBe(true);
    expect(await q.counts()).toEqual({ pending: 1, failed: 1 });

    // Try again: now it works, and the waiting one follows.
    await q.retryFailed();
    expect(state.sent).toEqual(['other', 'create', 'upload']);
  });

  it('HTTP 4xx (other than 401/408/429) fails at once; unexplained errors after five tries', async () => {
    expect(classify(new SyncHttpError('too large', 413))).toBe('fail');
    expect(classify(new SyncHttpError('slow', 408))).toBe('retry');
    expect(classify(new SyncHttpError('limit', 429))).toBe('retry');
    expect(classify(new SyncHttpError('offline', 0))).toBe('retry');
    expect(classify(new TypeError('Network request failed'))).toBe('retry');
    expect(classify(new Error('?'))).toBe('unknown');

    const { state, make, store, advance } = rig();
    const q = make();
    state.failNext = Array.from({ length: 5 }, () => new Error('disk full'));
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    for (let i = 0; i < 6; i++) await advance(10 * 60_000);
    expect(store.ops[0].status).toBe('failed');
    expect(store.ops[0].attempts).toBe(5);
  });

  it('merges a new edit into the waiting one for the same key', async () => {
    const { state, make, store } = rig({ online: false });
    const q = make();
    await q.enqueue({ kind: 'write', key: 'note', payload: { value: 'a' } });
    await q.enqueue({ kind: 'write', key: 'other', payload: { value: 'x' } });
    await q.enqueue({ kind: 'write', key: 'note', payload: { value: 'b' } });
    expect(store.ops.map((o) => o.payload)).toEqual([{ value: 'a+b' }, { value: 'x' }]);

    // Not across another operation on the same key: order would change.
    await q.enqueue({ kind: 'plain', key: 'note', payload: { value: 'upload' } });
    await q.enqueue({ kind: 'write', key: 'note', payload: { value: 'c' } });
    expect(store.ops.map((o) => o.payload)).toEqual([
      { value: 'a+b' },
      { value: 'x' },
      { value: 'upload' },
      { value: 'c' },
    ]);

    state.online = true;
    await q.flush();
    expect(state.sent).toEqual(['a+b', 'x', 'upload', 'c']);
  });

  it('parallel flushes run one at a time and send each operation once', async () => {
    const { state, make } = rig({ online: false });
    const q = make();
    for (const v of ['1', '2', '3']) await q.enqueue({ kind: 'plain', key: v, payload: { value: v } });
    state.online = true;
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(state.sent).toEqual(['1', '2', '3']);
  });

  it('picks up an operation added while a flush is running', async () => {
    const { state, make } = rig({ online: false });
    const q = make();
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    state.online = true;
    const flushing = q.flush();
    await q.enqueue({ kind: 'plain', key: 'b', payload: { value: '2' } });
    await flushing;
    await settle();
    expect(state.sent).toEqual(['1', '2']);
  });

  it('survives a restart: a new queue on the same store sends what was left', async () => {
    const { state, make } = rig({ online: false });
    await make().enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    state.online = true;
    await make().flush();
    expect(state.sent).toEqual(['1']);
  });

  it('an operation replayed after a crash does not create a duplicate', async () => {
    const { state, make, store } = rig({ online: false });
    const q = make();
    await q.enqueue({ kind: 'plain', key: 'chunk-0', payload: { value: 'chunk-0' } });

    // The upload reached the server, then the app was killed before the
    // operation was removed.
    state.online = true;
    const remove = store.remove;
    store.remove = async () => {
      throw new Error('killed');
    };
    await q.flush().catch(() => {});
    store.remove = remove;
    expect(store.ops).toHaveLength(1);

    await make().flush();
    expect(state.sent).toEqual(['chunk-0', 'chunk-0']);
    expect([...state.server.keys()]).toEqual(['chunk-0']);
    expect(store.ops).toHaveLength(0);
  });

  it("sends nothing while signed out, and only the signed-in student's operations", async () => {
    const { state, make, store } = rig({ online: false });
    const q = make();
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: 'mine' } });
    state.user = 'u2';
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: 'theirs' } });
    state.user = null;
    state.online = true;
    await q.flush();
    expect(state.sent).toEqual([]);

    state.user = 'u1';
    await q.flush();
    expect(state.sent).toEqual(['mine']);
    expect(store.ops.map((o) => o.userId)).toEqual(['u2']);
    await expect(q.enqueue({ kind: 'plain', key: 'a', payload: { value: 'x' } })).resolves.toBeDefined();
  });

  it('reports progress and completion to listeners', async () => {
    const store = createMemoryStore();
    const events: SyncEvent[] = [];
    const q = createSyncQueue({
      store,
      handlers: {
        upload: {
          run: async (_p: unknown, ctx: { progress: (f: number) => void }) => {
            ctx.progress(0.5);
            ctx.progress(1);
          },
        },
      },
      userId: () => 'u1',
      canSync: () => true,
      refresh: async () => true,
      newId: () => 'op1',
    });
    q.subscribe((e) => events.push(e));
    await q.enqueue({ kind: 'upload', key: 'l1', payload: {} });
    await settle();
    expect(events.filter((e) => e.type === 'progress').map((e) => (e as { fraction: number }).fraction)).toEqual([0.5, 1]);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  describe('coming back online (step 1.8 test 3)', () => {
    it('sends at once when the connection returns, even after failures pushed the next try minutes away', async () => {
      const { state, make, store, advance } = rig();
      const q = make();
      // Offline but not known yet: every try fails and the wait grows.
      state.failNext = Array.from({ length: 9 }, () => new NetworkError());
      await q.enqueue({ kind: 'plain', key: 'lecture', payload: { value: 'create' } });
      await q.enqueue({ kind: 'plain', key: 'lecture', payload: { value: 'upload' } });
      for (let i = 0; i < 8; i++) await advance(Date.parse(store.ops[0].nextAttemptAt as string) - state.now);
      const wait = Date.parse(store.ops[0].nextAttemptAt as string) - state.now;
      expect(wait).toBeGreaterThanOrEqual(2 * 60_000);
      state.failNext = [];

      // A plain flush still waits out the backoff…
      await q.flush();
      expect(state.sent).toEqual([]);
      // …the one run when the connection (or session, or app) comes back doesn't.
      await q.flush({ now: true });
      expect(state.sent).toEqual(['create', 'upload']);
      expect(await q.counts()).toEqual({ pending: 0, failed: 0 });
    });

    it('a hung request times out instead of blocking every later flush', async () => {
      const { state, make, store, advance } = rig();
      const q = make();
      state.hangNext = true;
      await q.enqueue({ kind: 'write', key: 'a', payload: { value: '1' } });
      await settle();
      expect(state.sent).toEqual([]);

      // The time limit passes: counted as a lost connection, the flush ends.
      await advance(2 * 60_000);
      expect(store.ops[0].lastError).toBe('No answer in time. (HTTP 408)');
      expect(store.ops[0].status).toBe('pending');

      await q.enqueue({ kind: 'plain', key: 'b', payload: { value: '2' } });
      await q.flush({ now: true });
      expect(state.sent).toEqual(['1', '2']);
    });

    it('an operation whose handler is not registered yet is looked at again shortly', async () => {
      const { state, make, advance, handlers, plain } = rig();
      delete handlers.plain;
      const q = make();
      await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
      await settle();
      expect(state.sent).toEqual([]);

      handlers.plain = plain;
      await advance(5_000);
      expect(state.sent).toEqual(['1']);
    });

    it('lists what is waiting, with its tries and last error (dev Sync now panel)', async () => {
      const { state, make } = rig();
      const q = make();
      state.failNext = [new NetworkError()];
      await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
      await settle();
      const [op] = await q.list();
      expect(op).toMatchObject({ kind: 'plain', key: 'a', attempts: 1, status: 'pending' });
      expect(op.lastError).toMatch(/offline/i);
    });
  });

  it("two queues on the same store (a development reload) never send an operation twice", async () => {
    const store = createMemoryStore();
    const sent: string[] = [];
    let chain: Promise<unknown> = Promise.resolve();
    const exclusive = <T,>(fn: () => Promise<T>) => {
      const run = chain.then(fn);
      chain = run.catch(() => {});
      return run;
    };
    const slow: SyncHandler<{ value: string }> = {
      run: async (p) => {
        await new Promise((r) => setTimeout(r, 5));
        sent.push(p.value);
      },
    };
    const make = () =>
      createSyncQueue({
        store,
        handlers: { slow },
        userId: () => 'u1',
        canSync: () => true,
        refresh: async () => true,
        newId: (() => {
          let n = 0;
          return () => `op-${Math.random()}-${n++}`;
        })(),
        exclusive,
      });
    const a = make();
    const b = make();
    const c = make();
    await store.add({ id: 'create', userId: 'u1', kind: 'slow', key: 'l1', payload: { value: 'create' }, createdAt: '', attempts: 0, nextAttemptAt: null, status: 'pending', lastError: null });
    await store.add({ id: 'chunk', userId: 'u1', kind: 'slow', key: 'l1', payload: { value: 'chunk' }, createdAt: '', attempts: 0, nextAttemptAt: null, status: 'pending', lastError: null });

    // "Back online" reaches all three at once.
    await Promise.all([a.flush({ now: true }), b.flush({ now: true }), c.flush({ now: true })]);
    expect(sent).toEqual(['create', 'chunk']);
  });

  it('keeps the HTTP status and the server error in lastError', async () => {
    const { state, make, store } = rig();
    const q = make();
    state.failNext = [new PermanentSyncError('Could not save the recording.', '23503 insert or update on table "audio_chunks" violates foreign key constraint')];
    await q.enqueue({ kind: 'plain', key: 'a', payload: { value: '1' } });
    await settle();
    expect(store.ops[0].lastError).toBe(
      'Could not save the recording. (23503 insert or update on table "audio_chunks" violates foreign key constraint)',
    );
    expect(describeError(new SyncHttpError('Could not upload.', 413))).toBe('Could not upload. (HTTP 413)');
  });
});

