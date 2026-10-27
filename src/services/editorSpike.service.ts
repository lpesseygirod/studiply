/**
 * The editor spike's one document (step 4.2, development only): a `document`
 * file at My library called "Editor spike (development)" whose `notes` tab
 * holds the editor's JSON. Saved on one device, loaded on the other, to show
 * both editors read and write the same JSON. Removed with the spike when
 * step 4.3 starts.
 */

import { supabase } from '../lib/supabase';
import { serviceError } from '../lib/cloudRows';
import { notifyLibraryUpdated } from '../lib/cache/library';
import type { DocJSON } from '../editor/types';
import type { Json } from '../types/supabase';

export const SPIKE_TITLE = 'Editor spike (development)';

async function spikeFileId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('files')
    .select('id')
    .eq('kind', 'document')
    .eq('title', SPIKE_TITLE)
    .is('deleted_at', null)
    .order('created_at')
    .limit(1);
  if (error) throw serviceError(error, 'Could not find the spike document.');
  return data[0]?.id ?? null;
}

export async function saveSpikeDocument(content: DocJSON): Promise<void> {
  let fileId = await spikeFileId();
  if (!fileId) {
    const { data, error } = await supabase.from('files').insert({ kind: 'document', title: SPIKE_TITLE }).select('id').single();
    if (error) throw serviceError(error, 'Could not create the spike document.');
    fileId = data.id;
    notifyLibraryUpdated();
  }
  const { error } = await supabase
    .from('documents')
    .upsert({ file_id: fileId, tab: 'notes', content: content as NonNullable<Json>, updated_at: new Date().toISOString() }, { onConflict: 'file_id,tab' });
  if (error) throw serviceError(error, 'Could not save the spike document.');
}

export async function loadSpikeDocument(): Promise<{ content: DocJSON; updatedAt: string } | null> {
  const fileId = await spikeFileId();
  if (!fileId) return null;
  const { data, error } = await supabase.from('documents').select('content, updated_at').eq('file_id', fileId).eq('tab', 'notes').maybeSingle();
  if (error) throw serviceError(error, 'Could not load the spike document.');
  return data ? { content: data.content as DocJSON, updatedAt: data.updated_at } : null;
}

/** Deletes the spike document for good (its file row; the tab goes with it). */
export async function deleteSpikeDocument(): Promise<boolean> {
  const fileId = await spikeFileId();
  if (!fileId) return false;
  const { error } = await supabase.from('files').delete().eq('id', fileId);
  if (error) throw serviceError(error, 'Could not delete the spike document.');
  notifyLibraryUpdated();
  return true;
}
