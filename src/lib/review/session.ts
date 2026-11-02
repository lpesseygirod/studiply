/**
 * A review session's order (step 9.1), pure so the review screen and its tests share it.
 *
 * Flashcards: the due cards in order. A rating moves on; Again puts the card (with its new state) at
 * the end, so it comes back in this session. A skip (the iPhone's swipe, the laptop's →) moves the
 * card to the end without rating it: it stays due. "Card n of N" counts the session's cards, Again's
 * returns included.
 *
 * Quiz me: the decks' questions one after the other (lectures in their order, questions in summary
 * order); Show answer, then Next question.
 */

import type { QuizDeck, ReviewCard } from './deck';
import type { Grade, ReviewState } from './schedule';
import type { QuizQuestion } from './cards';

export interface CardSession {
  queue: ReviewCard[];
  at: number;
  flipped: boolean;
  reviewed: number;
}

export const startCards = (cards: ReviewCard[]): CardSession => ({ queue: cards, at: 0, flipped: false, reviewed: 0 });
export const currentCard = (s: CardSession): ReviewCard | null => s.queue[s.at] ?? null;
export const flip = (s: CardSession): CardSession => (currentCard(s) ? { ...s, flipped: !s.flipped } : s);

/** After a rating of the current card (its new state): the next card; Again's comes back at the end. */
export function rated(s: CardSession, grade: Grade, state: ReviewState): CardSession {
  const card = currentCard(s);
  if (!card) return s;
  const queue = grade === 'again' ? [...s.queue, { ...card, state }] : s.queue;
  return { queue, at: s.at + 1, flipped: false, reviewed: s.reviewed + 1 };
}

/** The current card to the end, unrated (still due); nothing when it is the last one left. */
export function skip(s: CardSession): CardSession {
  const card = currentCard(s);
  if (!card || s.at >= s.queue.length - 1) return { ...s, flipped: false };
  const queue = [...s.queue.slice(0, s.at), ...s.queue.slice(s.at + 1), card];
  return { ...s, queue, flipped: false };
}

/** The current card taken out (Delete card). */
export function removeCurrent(s: CardSession): CardSession {
  return { ...s, queue: [...s.queue.slice(0, s.at), ...s.queue.slice(s.at + 1)], flipped: false };
}

/** "Card 5 of 12"; the progress bar's share (cards done of the session's). */
export const cardProgress = (s: CardSession) => ({ n: Math.min(s.at + 1, s.queue.length), total: s.queue.length, done: s.queue.length ? s.at / s.queue.length : 1 });

export interface QuizItem {
  deck: QuizDeck;
  question: QuizQuestion;
}
export interface QuizSession {
  items: QuizItem[];
  at: number;
  shown: boolean;
}

export const startQuiz = (decks: QuizDeck[]): QuizSession => ({ items: decks.flatMap((deck) => deck.questions.map((question) => ({ deck, question }))), at: 0, shown: false });
export const currentQuestion = (s: QuizSession): QuizItem | null => s.items[s.at] ?? null;
export const showAnswer = (s: QuizSession): QuizSession => ({ ...s, shown: true });
export const nextQuestion = (s: QuizSession): QuizSession => ({ ...s, at: Math.min(s.at + 1, s.items.length), shown: false });
export const quizProgress = (s: QuizSession) => ({ n: Math.min(s.at + 1, s.items.length), total: s.items.length, done: s.items.length ? s.at / s.items.length : 1 });
