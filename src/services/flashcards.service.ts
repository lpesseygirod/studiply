/**
 * flashcards.service.ts
 * Saving flashcards the student accepted (step 6.3: from a study-assistant
 * answer, or Make flashcard on a selection). Only `flashcards` rows: their
 * review (`review_schedule`, Again / Good / Easy) belongs to Phase 9, so the
 * Review today count doesn't change yet. Undo trashes them (`deleted_at`).
 */

import { serviceError } from '../lib/cloudRows';
import { supabase } from '../lib/supabase';
import type { Card } from './assistant-actions.service';

export interface CardsSource {
  /** The document the cards are about (the lecture, or the document of the selection). */
  fileId: string | null;
  /** Its course; undefined: read from the document. */
  courseId?: string | null;
  source: 'assistant' | 'selection';
  /** The answer's assistant_messages id ('assistant'), or the document's id ('selection'). */
  sourceRef: string | null;
}

export async function saveFlashcards(cards: Card[], from: CardsSource): Promise<{ count: number; undo: () => Promise<void> }> {
  let courseId = from.courseId ?? null;
  if (from.courseId === undefined && from.fileId) {
    const { data } = await supabase.from('files').select('course_id').eq('id', from.fileId).maybeSingle();
    courseId = (data?.course_id as string | null | undefined) ?? null;
  }
  const rows = cards.map((c) => ({
    front: c.front,
    back: c.back,
    file_id: from.fileId,
    course_id: courseId,
    source: from.source,
    source_ref: from.sourceRef,
  }));
  const { data, error } = await supabase.from('flashcards').insert(rows).select('id');
  if (error) throw serviceError(error, 'Could not save the flashcards.');
  const ids = (data ?? []).map((r) => r.id as string);
  return {
    count: ids.length,
    undo: async () => {
      const { error: undoError } = await supabase.from('flashcards').update({ deleted_at: new Date().toISOString() }).in('id', ids);
      if (undoError) throw serviceError(undoError, 'Could not remove the flashcards.');
    },
  };
}

/** "1 flashcard saved", "3 flashcards saved". */
export function savedText(count: number): string {
  return `${count} flashcard${count === 1 ? '' : 's'} saved`;
}
