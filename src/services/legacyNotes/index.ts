import { openDocument, saveDocument } from '../document.service';
import { getNoteResultBySession } from '../note.service';
import { getSession } from '../session.service';
import { getUserSettings } from '../settings.service';
import { getSourceFiles } from '../source-file.service';
import { supabase } from '../../lib/supabase';
import type { DocJSON } from '../../editor/types';
import { convertEarlierNote, type ConvertDeps, type ConvertOutcome } from './run';

export type { ConvertOutcome };

const EMPTY: DocJSON = { type: 'doc', content: [] };

/** The app's services (online, or the iPhone's cache and queue offline). */
const appDeps: ConvertDeps = {
  summaryExists: async (lectureId) => (await openDocument(lectureId, 'summary')).id !== null,
  latestNote: (lectureId) => getNoteResultBySession(lectureId),
  attachments: async (lectureId) =>
    (await getSourceFiles(lectureId))
      .filter((f) => f.file_type === 'photo' || f.file_type === 'pdf')
      .map((f) => ({ id: f.id, kind: f.file_type === 'photo' ? ('photo' as const) : ('pdf' as const), name: f.display_name ?? null })),
  language: async (lectureId) => {
    const lecture = await getSession(lectureId).catch(() => null);
    if (lecture?.language && lecture.language !== 'auto') return lecture.language;
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    return uid ? ((await getUserSettings(uid).catch(() => null))?.default_language ?? null) : null;
  },
  save: async (lectureId, doc) => {
    await saveDocument({ fileId: lectureId, tab: 'summary', base: EMPTY, next: doc });
  },
};

/** Step 4.9: the lecture's earlier note as its Summary tab, if that tab has no document yet. */
export function convertEarlierNoteOf(lectureId: string): Promise<ConvertOutcome> {
  return convertEarlierNote(lectureId, appDeps);
}
