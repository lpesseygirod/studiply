import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { recorder, type RecorderState } from '../services/recorder';
import { recordingFlow, type FlowState } from '../services/recording.service';

/** How many past levels a waveform keeps (one every TICK_MS). */
export const WAVE_BARS = 40;
const TICK_MS = 100;

export interface LiveRecording extends RecorderState {
  elapsedMs: number;
  /** The last WAVE_BARS loudness readings, oldest first (0 to 1). */
  levels: number[];
}

/**
 * The recording as the screens show it (step 5.3): its state, the time and
 * the recent loudness for the waveform, read every 100 ms while it records.
 */
export function useRecorder(): LiveRecording {
  const [state, setState] = useState<RecorderState>(() => recorder.state());
  const [elapsedMs, setElapsed] = useState(() => recorder.elapsedMs());
  const [levels, setLevels] = useState<number[]>(() => Array(WAVE_BARS).fill(0));
  const latest = useRef(levels);

  useEffect(() => recorder.subscribe(() => setState(recorder.state())), []);

  const active = state.status !== 'idle';
  useEffect(() => {
    setElapsed(recorder.elapsedMs());
    if (!active) return;
    const t = setInterval(() => {
      setElapsed(recorder.elapsedMs());
      latest.current = [...latest.current.slice(1), recorder.level()];
      setLevels(latest.current);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [active]);

  return { ...state, elapsedMs, levels };
}

/**
 * Only whether (and what) it records, with no clock: for screens that must
 * not redraw ten times a second (the document screen with its editor).
 */
export function useRecorderState(): RecorderState {
  const [state, setState] = useState<RecorderState>(() => recorder.state());
  useEffect(() => recorder.subscribe(() => setState(recorder.state())), []);
  return state;
}

/** After Stop (saving) and interrupted recordings. */
export function useRecordingFlow(): FlowState {
  return useSyncExternalStore(recordingFlow.subscribe, recordingFlow.getState, recordingFlow.getState);
}

export { clock } from '../utils/clock';
