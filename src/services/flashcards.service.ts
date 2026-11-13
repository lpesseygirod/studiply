/**
 * flashcards.service.ts
 * Saving flashcards the student accepted (from a study-assistant
 * answer, or Make flashcard on a selection) and a summary's (with its
 * key terms and self-test). Each new card is due at once (its
 * review_schedule row is made by the database), so it counts in Review today.
 * Undo trashes them (`deleted_at`), which takes them out of review.
 */

import { serviceError } from '../lib/cloudRows';
import { supabase } from '../lib/supabase';
import type { Card } from './assistant-actions.service';

export interface CardsSource {
  /** The document the cards are about (the lecture, or the document of the selection). */
  fileId: string | null;
  /** Its course; undefined: read from the document. */
  courseId?: string | null;
  source: 'assistant' | 'selection' | 'summary';
  /** The answer's assistant_messages id ('assistant'), the document's id ('selection'), the summary's id ('summary'). */
  sourceRef: string | null;
}

/** Whether a summary's flashcards are saved already (each summary's once; also Unit summaries and exam packs). */
export async function summaryCardsSaved(summaryId: string): Promise<boolean> {
  const { data, error } = await supabase.from('flashcards').select('id').eq('source', 'summary').eq('source_ref', summaryId).limit(1);
  if (error) throw serviceError(error, 'Could not read the flashcards.');
  return (data ?? []).length > 0;
}

/** The fronts of a document's live cards (a summary's card is saved once per lecture). */
export async function cardFronts(fileId: string): Promise<string[]> {
  const { data, error } = await supabase.from('flashcards').select('front').eq('file_id', fileId).is('deleted_at', null);
  if (error) throw serviceError(error, 'Could not read the flashcards.');
  return (data ?? []).map((r) => String(r.front ?? ''));
}

/** `kind`: term | question | card, the card's label in review; absent: a card. */
export async function saveFlashcards(cards: (Card & { kind?: 'term' | 'question' | 'card' })[], from: CardsSource): Promise<{ count: number; undo: () => Promise<void> }> {
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
    ...(c.kind && { kind: c.kind }),
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
