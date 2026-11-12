/**
 * codes.service.ts
 * Free-credit codes: redeeming one (Settings → Credits, on the web only: App Store rule
 * 3.1.1), whether she is an admin, and the dashboard's Codes section. All through the server's own
 * functions (20261029153100); the codes themselves are never readable by a student.
 */

import { isNetworkError, serviceError } from '../lib/cloudRows';
import { creditsMayHaveChanged } from '../lib/credits/signals';
import { normalizeCode, redeemAnswer, REDEEM_OFFLINE } from '../lib/credits/codes';
import { supabase } from '../lib/supabase';

export interface AdminCode {
  id: string;
  code: string;
  units: number;
  max_redemptions: number;
  used: number;
  expires_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
}

/** Redeems a code: the answer in her words; her balance and history are read again when it added credits. */
export async function redeemCode(raw: string): Promise<{ text: string; ok: boolean }> {
  const { data, error } = await supabase.rpc('redeem_code', { p_code: normalizeCode(raw) });
  if (error) {
    const err = serviceError(error, 'The code couldn’t be checked. Try again.');
    return { text: isNetworkError(err) ? REDEEM_OFFLINE : 'The code couldn’t be checked. Try again.', ok: false };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { outcome: string; units: number } | undefined;
  const answer = redeemAnswer(row?.outcome ?? 'invalid', Number(row?.units ?? 0));
  if (answer.ok) creditsMayHaveChanged(true);
  return answer;
}

/** Whether the signed-in student is an admin (false when it can't be read). */
export async function amIAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('am_i_admin');
  return !error && data === true;
}

export async function adminCodes(): Promise<AdminCode[]> {
  const { data, error } = await supabase.rpc('admin_codes');
  if (error) throw serviceError(error, 'Could not load the codes.');
  return (data ?? []) as AdminCode[];
}

/** A new code; `taken` when one with those words exists. */
export async function adminCreateCode(c: { code: string; units: number; uses: number; expiresAt: string | null; note: string }): Promise<'created' | 'taken'> {
  const { error } = await supabase.rpc('admin_create_code', {
    p_code: normalizeCode(c.code),
    p_units: c.units,
    p_max: c.uses,
    p_expires: c.expiresAt ?? undefined,
    p_note: c.note.trim() || undefined,
  });
  if (error?.code === '23505') return 'taken';
  if (error) throw serviceError(error, 'Could not make the code.');
  return 'created';
}

export async function adminSetCodeActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_code_active', { p_id: id, p_active: active });
  if (error) throw serviceError(error, 'Could not change the code.');
}
