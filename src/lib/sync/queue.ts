/**
 * queue.ts
 * The sync queue: changes made on the iPhone, waiting to reach Supabase.
 *
 * A change is saved locally first (the cache, a file on the phone) and an
 * operation is added here; the queue sends the operations in the order they
 * were made whenever the backend can be reached with a valid session.
 *
 * Rules:
 *  - First in, first out, one flush at a time. Operations added during a
 *    flush are sent in the same flush.
 *  - A failure that can fix itself (no connection, timeout, rate limit,
 *    server error) stops the flush; the same operation goes first next time,
 *    after a backoff (1 s, 2 s, 4 s … up to 5 min). An expired session (401)
 *    is refreshed once and the operation retried at once.
 *  - A failure that can't (refused, deleted on another device) marks the
 *    operation `failed` and keeps it, so nothing is silently lost. Later
 *    operations on the same key (e.g. the same lecture) wait behind it; the
 *    others carry on. The student can retry or discard it. An unexplained
 *    error counts as one after five tries; the recording's lanes
 *    (`persistent`) keep trying instead.
 *  - A new operation can be merged into the last waiting one of the same
 *    kind and key (two edits of the same note become one).
 *  - Handlers must be safe to run twice: an operation that reached the
 *    server just before the app was killed runs again on the next start.
 *  - When the connection comes back (or the student asks), waiting
 *    operations are tried at once, not after the rest of their backoff.
 *  - A handler that doesn't answer within its time limit counts as a lost
 *    connection, so one hung request can never stop the queue for good.
 *
 * The store, the clock and the timer are parameters, so the rules are unit
 * tested with an in-memory store (./memoryStore). ./index wires the real one.
 */

import { backoffMs, nextStep } from '../retry';

export type OpStatus = 'pending' | 'failed';

export interface SyncOp<P = unknown> {
  id: string;
  userId: string;
  kind: string;
  /** What the operation is about (a note, a lecture); orders and blocks per key. */
  key: string;
  payload: P;
  createdAt: string;
  attempts: number;
  /** ISO time before which the operation isn't tried again (after a failure). */
  nextAttemptAt: string | null;
  status: OpStatus;
  lastError: string | null;
}

export interface QueueStore {
  /** The user's operations, oldest first. */
  list(userId: string): Promise<SyncOp[]>;
  add(op: SyncOp): Promise<void>;
  update(op: SyncOp): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface HandlerContext {
  op: SyncOp;
  /** Upload progress of this operation, 0 to 1. */
  progress: (fraction: number) => void;
}

export interface SyncHandler<P = unknown> {
  run: (payload: P, ctx: HandlerContext) => Promise<void>;
  /** Longest a run may take before it counts as lost (default 2 minutes). */
  timeoutMs?: number;
  /** Combines a waiting operation's payload with a newer one for the same key. */
  merge?: (earlier: P, later: P) => P;
}

/** A failure retrying can't fix. `detail` is the server's own error, for the logs. */
export class PermanentSyncError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'PermanentSyncError';
  }
}

/** A failure with an HTTP status (0 = never reached the server). */
export class SyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'SyncHttpError';
  }
}

/** The message plus the status and server error, as kept in lastError and logged. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const { status, detail } = err as { status?: unknown; detail?: unknown };
  const parts = [
    typeof status === 'number' ? `HTTP ${status}` : null,
    typeof detail === 'string' && detail ? detail : null,
  ].filter(Boolean);
  return parts.length > 0 ? `${err.message} (${parts.join(' · ')})` : err.message;
}

/** A handler for some payload type; the queue only passes payloads through. */
export type AnyHandler = SyncHandler<any>;

export type SyncEvent =
  | { type: 'progress'; op: SyncOp; fraction: number }
  | { type: 'done'; op: SyncOp }
  | { type: 'failed'; op: SyncOp }
  | { type: 'changed' };

export interface QueueDeps {
  store: QueueStore;
  handlers: Record<string, AnyHandler>;
  /** Whose operations to send; null while signed out. */
  userId: () => string | null;
  /** Online with a usable session. */
  canSync: () => boolean;
  /** Refreshes the session after a 401; true when it worked. */
  refresh: () => Promise<boolean>;
  newId: () => string;
  now?: () => number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  /** Development log of what the queue does. */
  log?: (message: string) => void;
  /**
   * Runs a flush so that no other queue on the same store flushes at the
   * same time (development reloads can leave a second instance behind).
   */
  exclusive?: <T>(fn: () => Promise<T>) => Promise<T>;
  /**
   * The recording's lanes: an unexplained error is tried again for ever (with the
   * backoff), never marked failed; only a refusal is.
   */
  persistent?: boolean;
  /** Longest wait between tries (default 5 minutes). */
  maxBackoffMs?: number;
}

/** Errors that never reached a server, or say nothing about the change itself. */
export type FailureKind = 'retry' | 'refresh' | 'fail' | 'unknown';

const MAX_BACKOFF_MS = 5 * 60_000;
export const DEFAULT_TIMEOUT_MS = 2 * 60_000;
/** A kind without a handler yet (its module not loaded) is looked at again after this. */
const NO_HANDLER_RETRY_MS = 5_000;
/** Unexplained errors (not network, not HTTP) give up after this many tries. */
const MAX_UNKNOWN_ATTEMPTS = 5;
/**
 * The iPhone's Keychain refusing a read while the phone is locked (the session
 * saved "when unlocked"; errSecInteractionNotAllowed): fixes itself once unlocked.
 */
const KEYCHAIN_LOCKED = /User interaction is not allowed|errSecInteractionNotAllowed|-25308/;

export function classify(err: unknown): FailureKind {
  if (err instanceof PermanentSyncError) return 'fail';
  if (KEYCHAIN_LOCKED.test(err instanceof Error ? err.message : String(err))) return 'retry';
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') {
    const step = nextStep(status);
    return step === 'done' ? 'unknown' : step;
  }
  if ((err as { offline?: unknown; unreachable?: unknown } | null)?.offline === true) return 'retry';
  if ((err as { unreachable?: unknown } | null)?.unreachable === true) return 'retry';
  if (err instanceof TypeError && /network|fetch|load failed/i.test(err.message)) return 'retry';
  return 'unknown';
}

export function createSyncQueue(deps: QueueDeps) {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const listeners = new Set<(e: SyncEvent) => void>();
  const log = deps.log ?? (() => {});
  const exclusive = deps.exclusive ?? (<T,>(fn: () => Promise<T>) => fn());

  let running: Promise<void> | null = null;
  let again = false;
  let inFlight: string | null = null;
  let inFlightKey: string | null = null;
  let timer: unknown = null;
  /** Waiting for an operation in flight to end (idleFor). */
  const settledWaiters = new Set<() => void>();
  const setInFlight = (op: SyncOp | null) => {
    inFlight = op?.id ?? null;
    inFlightKey = op?.key ?? null;
    if (!op) settledWaiters.forEach((fn) => fn());
  };

  const emit = (e: SyncEvent) => listeners.forEach((fn) => fn(e));

  function schedule(at: number) {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      flush().catch(() => {});
    }, Math.max(0, at - now()));
  }

  async function enqueue<P>(input: { kind: string; key: string; payload: P }): Promise<SyncOp<P>> {
    const userId = deps.userId();
    if (!userId) throw new Error('Not signed in.');
    const handler: SyncHandler<P> | undefined = deps.handlers[input.kind];
    const ops = await deps.store.list(userId);

    // Merge into the last operation on this key, if it is the same kind,
    // still waiting and not being sent right now.
    const last = [...ops].reverse().find((o) => o.key === input.key);
    if (
      handler?.merge &&
      last &&
      last.kind === input.kind &&
      last.status === 'pending' &&
      last.id !== inFlight
    ) {
      const merged: SyncOp<P> = { ...(last as SyncOp<P>), payload: handler.merge(last.payload as P, input.payload) };
      await deps.store.update(merged);
      emit({ type: 'changed' });
      flush().catch(() => {});
      return merged;
    }

    const op: SyncOp<P> = {
      id: deps.newId(),
      userId,
      kind: input.kind,
      key: input.key,
      payload: input.payload,
      createdAt: new Date(now()).toISOString(),
      attempts: 0,
      nextAttemptAt: null,
      status: 'pending',
      lastError: null,
    };
    await deps.store.add(op);
    emit({ type: 'changed' });
    flush().catch(() => {});
    return op;
  }

  /** Runs one operation. Returns false when the flush must stop. */
  /** The handler's run, or a 408 if it doesn't finish in time. */
  function runWithTimeout(handler: AnyHandler, op: SyncOp): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const limit = handler.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const t = setTimer(() => reject(new SyncHttpError('No answer in time.', 408)), limit);
      handler
        .run(op.payload, { op, progress: (fraction) => emit({ type: 'progress', op, fraction }) })
        .then(resolve, reject)
        .finally(() => clearTimer(t));
    });
  }

  async function runOne(op: SyncOp): Promise<boolean> {
    const handler = deps.handlers[op.kind];
    if (!handler) {
      // Registered by a module not loaded yet: look again shortly.
      log(`no handler for ${op.kind} yet`);
      schedule(now() + NO_HANDLER_RETRY_MS);
      return false;
    }

    let refreshed = false;
    for (;;) {
      setInFlight(op);
      log(`${op.kind} ${op.key}: sending (try ${op.attempts + 1})`);
      try {
        await runWithTimeout(handler, op);
      } catch (err) {
        setInFlight(null);
        const message = describeError(err);
        let kind = classify(err);
        log(`${op.kind} ${op.key}: ${kind} (${message})`);

        if (kind === 'refresh' && !refreshed) {
          refreshed = true;
          if (await deps.refresh().catch(() => false)) continue;
          kind = 'retry';
        }
        if (kind === 'refresh') kind = 'retry';

        const attempts = op.attempts + 1;
        if (kind === 'fail' || (kind === 'unknown' && !deps.persistent && attempts >= MAX_UNKNOWN_ATTEMPTS)) {
          const failed: SyncOp = { ...op, attempts, status: 'failed', lastError: message, nextAttemptAt: null };
          await deps.store.update(failed);
          emit({ type: 'failed', op: failed });
          emit({ type: 'changed' });
          return true;
        }

        // The exponent is capped too: a persistent lane can count hundreds of tries.
        const wait = Math.min(deps.maxBackoffMs ?? MAX_BACKOFF_MS, backoffMs(Math.min(attempts, 20), random));
        const next = now() + wait;
        await deps.store.update({ ...op, attempts, lastError: message, nextAttemptAt: new Date(next).toISOString() });
        emit({ type: 'changed' });
        schedule(next);
        return false;
      }
      setInFlight(null);
      // If the app is killed before this, the operation runs again on the
      // next start, which handlers allow.
      await deps.store.remove(op.id);
      emit({ type: 'done', op });
      emit({ type: 'changed' });
      return true;
    }
  }

  async function drain(): Promise<void> {
    for (;;) {
      const userId = deps.userId();
      if (!userId || !deps.canSync()) return;
      const ops = await deps.store.list(userId);

      const blocked = new Set(ops.filter((o) => o.status === 'failed').map((o) => o.key));
      const next = ops.find((o) => o.status === 'pending' && !blocked.has(o.key));
      if (!next) return;

      if (next.nextAttemptAt && Date.parse(next.nextAttemptAt) > now()) {
        schedule(Date.parse(next.nextAttemptAt));
        return;
      }
      if (!(await runOne(next))) return;
    }
  }

  /** Waiting operations become due now (the connection is back, or the student asked). */
  async function clearBackoff(): Promise<void> {
    const userId = deps.userId();
    if (!userId) return;
    for (const op of await deps.store.list(userId)) {
      if (op.status === 'pending' && op.nextAttemptAt) await deps.store.update({ ...op, nextAttemptAt: null });
    }
  }

  /**
   * Sends what can be sent now. Calls during a flush join it. `now` first
   * clears the backoff of waiting operations (back online, Sync now).
   */
  async function flush(options: { now?: boolean } = {}): Promise<void> {
    if (options.now) {
      await clearBackoff();
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    }
    if (running) {
      again = true;
      return running;
    }
    const run = (async () => {
      try {
        do {
          again = false;
          await exclusive(drain);
        } while (again);
      } finally {
        // Cleared in the same step as the last `again` check, so a call
        // arriving now starts a new flush instead of joining a finished one.
        running = null;
      }
    })();
    running = run;
    return run;
  }

  /** Waiting and failed operations, for the sync status in Settings. */
  async function counts(): Promise<{ pending: number; failed: number }> {
    const userId = deps.userId();
    if (!userId) return { pending: 0, failed: 0 };
    const ops = await deps.store.list(userId);
    return {
      pending: ops.filter((o) => o.status === 'pending').length,
      failed: ops.filter((o) => o.status === 'failed').length,
    };
  }

  async function pendingFor(key: string): Promise<SyncOp[]> {
    const userId = deps.userId();
    if (!userId) return [];
    return (await deps.store.list(userId)).filter((o) => o.key === key);
  }

  /** Tries the failed operations again, from the start of the backoff. */
  async function retryFailed(): Promise<void> {
    const userId = deps.userId();
    if (!userId) return;
    for (const op of await deps.store.list(userId)) {
      if (op.status === 'failed' || op.nextAttemptAt) {
        await deps.store.update({ ...op, status: 'pending', attempts: 0, nextAttemptAt: null });
      }
    }
    emit({ type: 'changed' });
    await flush();
  }

  async function discard(id: string): Promise<void> {
    await deps.store.remove(id);
    emit({ type: 'changed' });
    flush().catch(() => {});
  }

  /**
   * Cancel recording (Lea, 6 Nov): every waiting operation that `test` picks is removed (one in flight
   * finishes: see idleFor). Returns how many were removed.
   */
  async function discardWhere(test: (op: SyncOp) => boolean): Promise<number> {
    const userId = deps.userId();
    if (!userId) return 0;
    const gone = (await deps.store.list(userId)).filter((o) => o.id !== inFlight && test(o));
    for (const op of gone) await deps.store.remove(op.id);
    if (gone.length) emit({ type: 'changed' });
    return gone.length;
  }

  /** Resolves once no operation on `key` is being sent (at once when none is). */
  function idleFor(key: string): Promise<void> {
    if (inFlightKey !== key) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (inFlightKey === key) return;
        settledWaiters.delete(check);
        resolve();
      };
      settledWaiters.add(check);
    });
  }

  function subscribe(fn: (e: SyncEvent) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  /** Every waiting or failed operation, oldest first (Settings, development). */
  async function list(): Promise<SyncOp[]> {
    const userId = deps.userId();
    return userId ? deps.store.list(userId) : [];
  }

  return { enqueue, flush, counts, pendingFor, retryFailed, discard, discardWhere, idleFor, subscribe, list };
}

export type SyncQueue = ReturnType<typeof createSyncQueue>;
