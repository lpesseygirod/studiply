/**
 * A stand-in for the supabase-js query builder in service tests.
 *
 * Every `from(table)` chain records its calls ([method, ...args]); awaiting
 * the chain resolves to the next answer queued for that table (default
 * `{ data: null, error: null }`). Use with:
 *
 *   jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
 */

export interface Answer {
  data?: unknown;
  error?: { code?: string; message: string } | null;
  count?: number | null;
}

export interface Chain {
  table: string;
  calls: [string, ...unknown[]][];
}

export const chains: Chain[] = [];
const queued = new Map<string, Answer[]>();

/** Queue the answers the next chains on `table` resolve to, in order. */
export function answer(table: string, ...answers: Answer[]): void {
  queued.set(table, [...(queued.get(table) ?? []), ...answers]);
}

export function resetSupabaseMock(): void {
  chains.length = 0;
  queued.clear();
}

/** The calls of the chains on `table`, e.g. to find what was inserted. */
export function callsOn(table: string, method: string): unknown[][] {
  return chains
    .filter((c) => c.table === table)
    .flatMap((c) => c.calls.filter(([m]) => m === method).map(([, ...args]) => args));
}

function builder(table: string) {
  const chain: Chain = { table, calls: [] };
  chains.push(chain);
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const next = queued.get(table)?.shift() ?? {};
          const result = { data: next.data ?? null, error: next.error ?? null, count: next.count ?? null };
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        return (...args: unknown[]) => {
          chain.calls.push([String(prop), ...args]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

export const module = {
  supabase: {
    from: (table: string) => builder(table),
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' }, access_token: 'token' } } }),
    },
  },
  supabaseUrl: 'http://127.0.0.1:54321',
  anonKey: 'anon',
};
