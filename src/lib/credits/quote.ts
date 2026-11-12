/**
 * quote.ts
 * What a lecture's summary will cost, decided as the server's spend_summary does
 * (20261029152800_credits.sql), from her own ledger rows for that lecture (RLS; a reverse carries the
 * lecture of the row it undoes). Only for the panel's line: the server still decides.
 */

import { AGAIN_UNITS, LECTURE_UNITS } from '../../../supabase/functions/_shared/credits';

export interface LedgerRow {
  id: string;
  kind: string;
  reverses: string | null;
}

export interface SummaryQuote {
  /** 0 (the first, included), 2 (again), 4 or 6 (a lecture never paid for pays first). */
  units: number;
  first: boolean;
  unpaidLecture: boolean;
}

export function summaryQuote(rows: readonly LedgerRow[]): SummaryQuote {
  const reversed = new Set(rows.map((r) => r.reverses).filter((id): id is string => !!id));
  const live = (r: LedgerRow) => !reversed.has(r.id);
  const paid = rows.some((r) => (r.kind === 'spend_lecture' || r.kind === 'carry_over') && live(r));
  const first = !rows.some((r) => r.kind === 'spend_summary' && live(r));
  return { units: (paid ? 0 : LECTURE_UNITS) + (first ? 0 : AGAIN_UNITS), first, unpaidLecture: !paid };
}
