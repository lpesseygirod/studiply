/**
 * Which document the study assistant is about. The document
 * screen says what it shows; the laptop's assistant panel (in the shell
 * layout) reads it. Only a lecture can be asked about: assistant-chat
 * answers from a lecture's transcript.
 */

import { useSyncExternalStore } from 'react';

export interface AssistantTarget {
  documentId: string;
  isLecture: boolean;
}

let target: AssistantTarget | null = null;
const listeners = new Set<() => void>();

export function setAssistantTarget(next: AssistantTarget | null): void {
  if (next?.documentId === target?.documentId && next?.isLecture === target?.isLecture) return;
  target = next;
  listeners.forEach((fn) => fn());
}

export function useAssistantTarget(): AssistantTarget | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => target,
    () => target,
  );
}
