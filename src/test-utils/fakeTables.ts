/**
 * A small in-memory stand-in for the Supabase tables a service writes, for
 * tests that need the server to behave like one: rows persist between
 * calls, `updated_at` moves on every write (the trigger), `upsert` honours
 * `onConflict` / `ignoreDuplicates`, and filters read JSON paths
 * (`content->conflict->>editId`). Only the query builder calls the
 * services use are implemented.
 *
 *   jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
 */

type Row = Record<string, unknown>;

export const tables: Record<string, Row[]> = {};
let clock = Date.parse('2026-10-28T09:00:00.000Z');
let beforeUpdate: ((table: string) => void) | null = null;

export function resetTables(): void {
  for (const key of Object.keys(tables)) delete tables[key];
  clock = Date.parse('2026-10-28T09:00:00.000Z');
  beforeUpdate = null;
}

/** Runs `fn` once, just before the next update reaches `table` (another device writing in between). */
export function onNextUpdate(fn: (table: string) => void): void {
  beforeUpdate = fn;
}

const stamp = () => new Date((clock += 1000)).toISOString();

export function rowsOf(table: string): Row[] {
  return (tables[table] ??= []);
}

/** Writes a row as another device would (moves updated_at). */
export function serverWrite(table: string, row: Row): Row {
  const rows = rowsOf(table);
  const at = stamp();
  const index = rows.findIndex((r) => r.id === row.id);
  const next = { user_id: 'user-1', created_at: at, ...(index >= 0 ? rows[index] : {}), ...row, updated_at: at };
  if (index >= 0) rows[index] = next;
  else rows.push(next);
  return next;
}

function valueAt(row: Row, column: string): unknown {
  const parts = column.split(/->>?/);
  let value: unknown = row;
  for (const part of parts) value = value && typeof value === 'object' ? (value as Row)[part] : undefined;
  return value;
}

type Filter = (row: Row) => boolean;

function builder(table: string) {
  const filters: Filter[] = [];
  let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  let payload: Row | Row[] | null = null;
  let options: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  let returning = false;
  let single: 'single' | 'maybe' | null = null;
  let order: { column: string; ascending: boolean } | null = null;
  let limit: number | null = null;

  const run = (): { data: unknown; error: { message: string; code?: string } | null } => {
    const rows = rowsOf(table);
    const matching = () => rows.filter((r) => filters.every((f) => f(r)));
    let result: Row[] = [];

    if (op === 'select') {
      result = matching();
    } else if (op === 'insert' || op === 'upsert') {
      for (const input of Array.isArray(payload) ? payload : [payload ?? {}]) {
        const keys = (options.onConflict ?? 'id').split(',');
        const existing = op === 'upsert' ? rows.find((r) => keys.every((k) => r[k] === input[k])) : undefined;
        if (op === 'insert' && rows.some((r) => r.id === input.id && input.id !== undefined)) {
          return { data: null, error: { message: 'duplicate key', code: '23505' } };
        }
        if (existing) {
          if (!options.ignoreDuplicates) Object.assign(existing, input, { updated_at: stamp() });
          continue;
        }
        const at = stamp();
        const row = { id: `srv-${rows.length + 1}-${table}`, user_id: 'user-1', created_at: at, updated_at: at, ...input };
        rows.push(row);
        result.push(row);
      }
    } else if (op === 'update') {
      if (beforeUpdate) {
        const fn = beforeUpdate;
        beforeUpdate = null;
        fn(table);
      }
      result = matching();
      for (const row of result) Object.assign(row, payload, { updated_at: stamp() });
    } else if (op === 'delete') {
      result = matching();
      tables[table] = rows.filter((r) => !result.includes(r));
    }

    if (order) {
      const { column, ascending } = order;
      result = [...result].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
    }
    if (limit !== null) result = result.slice(0, limit);
    const copies = result.map((r) => JSON.parse(JSON.stringify(r)) as Row);
    if (op !== 'select' && !returning) return { data: null, error: null };
    if (single === 'single') return copies.length === 1 ? { data: copies[0], error: null } : { data: null, error: { message: 'not one row', code: 'PGRST116' } };
    if (single === 'maybe') return { data: copies[0] ?? null, error: null };
    return { data: copies, error: null };
  };

  const chain: Record<string, unknown> = {
    select: () => {
      if (op !== 'select') returning = true;
      return chain;
    },
    insert: (rows: Row | Row[]) => ((op = 'insert'), (payload = rows), chain),
    upsert: (rows: Row | Row[], opts: typeof options = {}) => ((op = 'upsert'), (payload = rows), (options = opts), chain),
    update: (patch: Row) => ((op = 'update'), (payload = patch), chain),
    delete: () => ((op = 'delete'), chain),
    eq: (column: string, value: unknown) => (filters.push((r) => valueAt(r, column) === value), chain),
    in: (column: string, values: unknown[]) => (filters.push((r) => values.includes(valueAt(r, column))), chain),
    is: (column: string, value: unknown) => (filters.push((r) => (valueAt(r, column) ?? null) === value), chain),
    order: (column: string, opts: { ascending?: boolean } = {}) => ((order = { column, ascending: opts.ascending ?? true }), chain),
    limit: (n: number) => ((limit = n), chain),
    single: () => ((single = 'single'), chain),
    maybeSingle: () => ((single = 'maybe'), chain),
    then: (resolve: (value: unknown) => void, reject: (err: unknown) => void) => {
      try {
        resolve(run());
      } catch (err) {
        reject(err);
      }
    },
  };
  return chain;
}

export const module = {
  supabase: { from: (table: string) => builder(table) },
};
