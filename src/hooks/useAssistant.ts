import { useCallback, useEffect, useRef, useState } from 'react';

import { ConsentDeclinedError } from '../services/consent.service';
import { EXTRAS_NOT_SENT, extrasRefusal } from '../lib/credits/extras';
import { recorder } from '../services/recorder';
import {
  QUICK_PROMPTS,
  askAssistant,
  loadConversation,
  transcribedUpTo,
  type AskInput,
  type ChatTurn,
  type QuickPrompt,
} from '../services/assistant.service';
import { useRecorderState } from './useRecorder';

/** How often "Knows this lecture up to" is read again while the lecture records. */
const KNOWN_REFRESH_MS = 20_000;

/** Drafts per lecture, kept while the app runs (closing the sheet or the panel keeps them). */
const drafts = new Map<string, string>();

export interface AssistantChat {
  lectureId: string | null;
  turns: ChatTurn[];
  /** The earlier questions are loading, or couldn't be loaded. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Where the transcript ends (ms); null until known. */
  knownUpToMs: number | null;
  /** An answer is streaming in. */
  busy: boolean;
  /** This lecture is recording (or paused) on this device. */
  recordingHere: boolean;
  draft: string;
  setDraft: (text: string) => void;
  ask: (message: string, quickPrompt: QuickPrompt | null) => void;
  retry: (turnId: string) => void;
}

/** The recording's clock while this lecture records here; null after class (the server uses the transcript's end). */
function nowFor(lectureId: string): number | null {
  const s = recorder.state();
  return s.lectureId === lectureId && (s.status === 'recording' || s.status === 'paused') ? recorder.elapsedMs() : null;
}

/** Where the live transcript on this device ends (works offline while recording). */
async function localKnownUpTo(lectureId: string): Promise<number> {
  const s = recorder.state();
  if (s.lectureId !== lectureId) return 0;
  const snap = await recorder.snapshot(lectureId).catch(() => null);
  return (snap?.transcript ?? []).reduce((end, seg) => Math.max(end, seg.endMs), 0);
}

function failureText(err: unknown): string {
  if (err instanceof ConsentDeclinedError) return 'Nothing was sent: the assistant needs your permission. Ask again to allow it.';
  // The allowance used up: why is said once, in the line above the composer.
  if (extrasRefusal(err)) return EXTRAS_NOT_SENT;
  return err instanceof Error && err.message ? err.message : 'The assistant could not answer. Please try again.';
}

/**
 * The study assistant's conversation about one lecture: its earlier questions and
 * answers, asking (a typed question or a quick prompt), the answer streaming into its turn, Retry,
 * and how far the lecture is transcribed. `lectureId` null: nothing to ask about.
 */
export function useAssistant(lectureId: string | null): AssistantChat {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [status, setStatus] = useState<AssistantChat['status']>('idle');
  const [knownUpToMs, setKnown] = useState<number | null>(null);
  const [draft, setDraftState] = useState('');
  const live = useRecorderState();
  const recordingHere = !!lectureId && live.lectureId === lectureId && live.status !== 'idle';
  const current = useRef<string | null>(lectureId);
  current.current = lectureId;
  const aborts = useRef(new Set<AbortController>());

  const refreshKnown = useCallback(async (id: string) => {
    const [server, local] = await Promise.all([transcribedUpTo(id).catch(() => 0), localKnownUpTo(id)]);
    if (current.current === id) setKnown((k) => Math.max(k ?? 0, server, local));
  }, []);

  useEffect(() => {
    setTurns([]);
    setKnown(null);
    setDraftState(lectureId ? (drafts.get(lectureId) ?? '') : '');
    if (!lectureId) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    loadConversation(lectureId)
      .then((list) => {
        if (current.current !== lectureId) return;
        setTurns(list);
        setStatus('ready');
      })
      .catch(() => current.current === lectureId && setStatus('error'));
    void refreshKnown(lectureId);
    const running = aborts.current;
    return () => {
      // Leaving the lecture: an answer still streaming is finished and saved by the server anyway.
      running.forEach((a) => a.abort());
      running.clear();
    };
  }, [lectureId, refreshKnown]);

  // While it records, the transcript grows: read again now and then (and as chunks arrive here).
  useEffect(() => {
    if (!lectureId || !recordingHere) return;
    const t = setInterval(() => void refreshKnown(lectureId), KNOWN_REFRESH_MS);
    const off = recorder.subscribe(() => void refreshKnown(lectureId));
    return () => {
      clearInterval(t);
      off();
    };
  }, [lectureId, recordingHere, refreshKnown]);

  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);
      if (lectureId) drafts.set(lectureId, text);
    },
    [lectureId],
  );

  const run = useCallback(
    (message: string, quickPrompt: QuickPrompt | null, replaceId?: string) => {
      if (!lectureId) return;
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const turn: ChatTurn = { id, question: message || QUICK_PROMPTS[quickPrompt ?? 'last_10_min'].label, quickPrompt, window: null, answer: '', status: 'streaming' };
      setTurns((list) => {
        const at = replaceId ? list.findIndex((t) => t.id === replaceId) : -1;
        return at === -1 ? [...list, turn] : [...list.slice(0, at), turn, ...list.slice(at + 1)];
      });
      const update = (change: (t: ChatTurn) => ChatTurn) => setTurns((list) => list.map((t) => (t.id === id ? change(t) : t)));
      const abort = new AbortController();
      aborts.current.add(abort);
      const input: AskInput = { lectureId, message, quickPrompt, nowMs: nowFor(lectureId) };
      askAssistant(
        input,
        {
          meta: (m) => {
            update((t) => ({ ...t, window: m.window, answerId: m.answerId }));
            setKnown((k) => Math.max(k ?? 0, m.knownUpToMs));
          },
          delta: (text) => update((t) => ({ ...t, answer: t.answer + text })),
          done: () => update((t) => ({ ...t, status: 'done' })),
        },
        abort.signal,
      )
        .catch((err) => {
          if (abort.signal.aborted) return;
          // The pieces already shown are dropped (the streaming contract).
          update((t) => ({ ...t, answer: '', status: 'error', error: failureText(err) }));
        })
        .finally(() => aborts.current.delete(abort));
    },
    [lectureId],
  );

  const busy = turns.some((t) => t.status === 'streaming');

  const ask = useCallback(
    (message: string, quickPrompt: QuickPrompt | null) => {
      const text = message.trim();
      if (busy || (!text && !quickPrompt)) return;
      if (!quickPrompt) setDraft('');
      run(text, quickPrompt);
    },
    [busy, run, setDraft],
  );

  const retry = useCallback(
    (turnId: string) => {
      const turn = turns.find((t) => t.id === turnId);
      if (!turn || busy) return;
      // A quick prompt is asked again as such (its label isn't a typed question).
      run(turn.quickPrompt ? '' : turn.question, turn.quickPrompt, turnId);
    },
    [turns, busy, run],
  );

  return { lectureId, turns, status, knownUpToMs, busy, recordingHere, draft, setDraft, ask, retry };
}
