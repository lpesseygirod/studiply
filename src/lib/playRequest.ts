/**
 * playRequest.ts
 * "Play the lecture from this moment" from outside the document screen
 * (step 6.2: a time in a study-assistant answer). The laptop's assistant
 * panel lives in the shell layout, the mini player in the document screen;
 * the screen showing that lecture listens and opens its MiniPlayer.
 */

export interface PlayAt {
  lectureId: string;
  ms: number;
}

const listeners = new Set<(request: PlayAt) => void>();

export function requestPlay(request: PlayAt): void {
  listeners.forEach((fn) => fn(request));
}

export function onPlayRequest(fn: (request: PlayAt) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
