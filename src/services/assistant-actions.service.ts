/**
 * assistant-actions.service.ts
 * Step 6.3 from the app: Ask Claude on a selection (Explain simpler, Give an
 * example, Go deeper, Make flashcard, Rewrite section) and Flashcards from a
 * study-assistant answer, through assistant-chat's 'selection' and
 * 'flashcards' modes. The answer is a suggestion the student accepts or
 * rejects; nothing is applied here.
 *
 * Consent is asked once first (as for questions). The answer's shape is
 * checked again here: anything else is an error and nothing is shown to
 * accept. With EXPO_PUBLIC_MOCK_AI=1 (development) nothing is sent.
 */

import { isMockAiForced } from '../lib/aiMode';
import { callFunction, FunctionError } from '../lib/functions';
import {
  MAX_SELECTION_CHARS,
  SELECTION_ACTIONS,
  SELECTION_ACTION_ORDER,
  parseCards,
  parseSuggestion,
  type Card,
  type SelectionAction,
} from '../../supabase/functions/_shared/assistant';
import { ensureConsent, forgetConsent } from './consent.service';

export { MAX_SELECTION_CHARS, SELECTION_ACTIONS, SELECTION_ACTION_ORDER };
export type { Card, SelectionAction };

export type ActionResult = { kind: 'suggestion'; text: string } | { kind: 'cards'; cards: Card[] };

const unreadable = () => new FunctionError('Claude’s answer could not be read. Nothing was changed; please try again.', 502, 'unreadable');

async function call(body: Record<string, unknown>): Promise<{ suggestion?: unknown; cards?: unknown }> {
  await ensureConsent('assistant_summary');
  try {
    return await callFunction<{ suggestion?: unknown; cards?: unknown }>('assistant-chat', body);
  } catch (err) {
    // Consent withdrawn on another device: asked again next time.
    if (err instanceof FunctionError && err.code === 'consent_required') forgetConsent();
    throw err;
  }
}

/** Ask Claude on the selected text: a suggestion (Explain simpler, Example, Go deeper, Rewrite) or cards (Make flashcard). */
export async function askAboutSelection(input: { fileId: string; action: SelectionAction; text: string; context: string }): Promise<ActionResult> {
  if (isMockAiForced()) return simulated(input.action, input.text);
  const answer = await call({ mode: 'selection', ...input });
  if (SELECTION_ACTIONS[input.action].result === 'cards') {
    const cards = parseCards(JSON.stringify({ cards: answer.cards }));
    if (!cards) throw unreadable();
    return { kind: 'cards', cards };
  }
  const text = parseSuggestion(JSON.stringify({ suggestion: answer.suggestion }));
  if (!text) throw unreadable();
  return { kind: 'suggestion', text };
}

/** Flashcards from a saved study-assistant answer. */
export async function cardsFromAnswer(lectureId: string, answerId: string, answerText: string): Promise<Card[]> {
  if (isMockAiForced()) {
    const r = await simulated('flashcard', answerText);
    return r.kind === 'cards' ? r.cards : [];
  }
  const answer = await call({ mode: 'flashcards', lectureId, answerId });
  const cards = parseCards(JSON.stringify({ cards: answer.cards }));
  if (!cards) throw unreadable();
  return cards;
}

/** Development without AI calls. */
async function simulated(action: SelectionAction, text: string): Promise<ActionResult> {
  await new Promise((r) => setTimeout(r, 400));
  const short = text.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (SELECTION_ACTIONS[action].result === 'cards') return { kind: 'cards', cards: [{ front: '(Simulated) What is it about?', back: short }] };
  const lead = { simpler: 'In simpler words:', example: 'For example:', deeper: 'Going deeper:', rewrite: 'Rewritten:', flashcard: '' }[action];
  return { kind: 'suggestion', text: `(Simulated) **${lead}** ${short}` };
}
