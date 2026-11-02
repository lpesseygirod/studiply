/**
 * What a summary gives the review screen (step 9.1): its flashcards, its key terms and its
 * self-test as cards, and its self-test as Quiz me questions with the mark that asked for each.
 * Pure: the cards are saved with the summary (services/summaryDoc), the questions read on both
 * devices (offline too, from the cached summary).
 */

import { isImplicitMark } from '../summaryDoc';

export type CardKind = 'term' | 'question' | 'card';
export interface NewCard {
  front: string;
  back: string;
  kind: CardKind;
}

/** Claude's **bold** marks out (a card shows plain text); spaces tidied. */
export const plainCardText = (s: unknown): string => (typeof s === 'string' ? s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim() : '');

/** A card's front as compared for duplicates: case, spacing and ** ignored. */
export const frontKey = (s: string): string => plainCardText(s).toLowerCase();

type Result = Record<string, unknown>;
const list = <T>(r: Result, key: string) => (Array.isArray(r[key]) ? (r[key] as T[]) : []);

/**
 * A summary's cards: its key terms (glossary: term → definition, TERM), its own flashcards, its
 * self-test (question → answer, QUESTION); empty ones left out, the same front once (the first).
 */
export function summaryCards(result: Result): NewCard[] {
  const all: NewCard[] = [
    ...list<{ term: string; definition: string }>(result, 'glossary').map((g) => ({ front: plainCardText(g?.term), back: plainCardText(g?.definition), kind: 'term' as const })),
    ...list<{ front: string; back: string }>(result, 'flashcards').map((c) => ({ front: plainCardText(c?.front), back: plainCardText(c?.back), kind: 'card' as const })),
    ...list<{ question: string; answer: string }>(result, 'selfTest').map((q) => ({ front: plainCardText(q?.question), back: plainCardText(q?.answer), kind: 'question' as const })),
  ];
  return newCards(all, []);
}

/** The cards whose front isn't among `existing` (the lecture's live cards) nor earlier in the list. */
export function newCards(cards: NewCard[], existing: Iterable<string>): NewCard[] {
  const seen = new Set([...existing].map(frontKey));
  return cards.filter((c) => {
    const key = frontKey(c.front);
    if (!key || !plainCardText(c.back) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- Quiz me (the Review screen's tab, desktop-07) ----------

export interface QuizMark {
  type: string;
  level: number;
  /** "06:40" (the mark's time, else its section's). */
  t: string;
}
export interface QuizQuestion {
  question: string;
  answer: string;
  mark: QuizMark | null;
}

type Chip = { markId: string; type: string; level: number };
type Section = { timestamp?: string; markChips?: Chip[] };

/** "6:40" → "06:40" (the mockup's), "1:02:03" as it is. */
export const clockText = (t: string): string => (/^\d:\d{2}$/.test(t.trim()) ? `0${t.trim()}` : t.trim());

/** The summary's self-test, in order, each with the student's mark that asked for it (type, level, time). */
export function quizQuestions(result: Result): QuizQuestion[] {
  const sections = list<Section>(result, 'sections');
  const signals = list<{ markId: string; timestamp: string }>(result, 'examSignals');
  const markOf = (id: string): QuizMark | null => {
    if (!id || isImplicitMark(id)) return null;
    const sec = sections.find((s) => (s.markChips ?? []).some((c) => c.markId === id));
    const chip = sec?.markChips?.find((c) => c.markId === id);
    if (!chip) return null;
    const t = signals.find((e) => e.markId === id)?.timestamp || sec?.timestamp || '';
    return { type: chip.type, level: Number(chip.level) || 0, t: clockText(t) };
  };
  return list<{ question: string; answer: string; fromMarkId: string }>(result, 'selfTest')
    .map((q) => ({ question: plainCardText(q?.question), answer: plainCardText(q?.answer), mark: markOf(String(q?.fromMarkId ?? '')) }))
    .filter((q) => q.question && q.answer);
}

/** "Exam 9/10 · from 06:40". */
export const markChipText = (m: QuizMark): string => `${m.type.charAt(0).toUpperCase()}${m.type.slice(1)} ${m.level}/10${m.t ? ` · from ${m.t}` : ''}`;

/** The student's Exam and Confused marks in a summary (each once; the implicit signals aren't hers). */
export function marksOf(result: Result): { exam: number; confused: number } {
  const seen = new Map<string, string>();
  for (const s of list<Section>(result, 'sections')) for (const c of s.markChips ?? []) if (!isImplicitMark(c.markId)) seen.set(c.markId, c.type);
  const types = [...seen.values()];
  return { exam: types.filter((t) => t === 'exam').length, confused: types.filter((t) => t === 'confused').length };
}

/** "From your marks: 2 Exam · 1 Confused"; '' without any. */
export function marksText(m: { exam: number; confused: number }): string {
  const parts = [m.exam ? `${m.exam} Exam` : '', m.confused ? `${m.confused} Confused` : ''].filter(Boolean);
  return parts.length ? `From your marks: ${parts.join(' · ')}` : '';
}
