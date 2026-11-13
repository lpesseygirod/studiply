import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';

import type { ThemeColors } from '../../src/constants/colors';
import { Typography } from '../../src/constants/typography';
import { useThemedStyles } from '../../src/theme/ThemeProvider';
import { GradientFill } from '../../src/components/GradientBackground';
import { useAuth } from '../../src/hooks/useAuth';
import { getConnection, subscribe as onConnection } from '../../src/lib/connectivity';
import { ensureConsent } from '../../src/services/consent.service';
import { recorder, CHUNK_MS, OVERLAP_MS, type ChunkInfo, type RecorderState, type Segment } from '../../src/services/recorder';
import { createSession } from '../../src/services/session.service';
import { getUserSettings } from '../../src/services/settings.service';
import { errorMessage } from '../../src/utils/errors';

/**
 * Development only: the recorder service on a plain screen, until
 * the recording screen. Start makes a lecture "Recorder test HH:MM" in
 * My library and records it (30-second chunks overlapping by 500 ms, or
 * ?chunk=5&overlap=500); Pause, Resume, Stop. A recording the page lost (a
 * reload, a crash) shows as interrupted, with Continue and Finish. On a real
 * account the transcription is real (it costs); the Chrome check
 * (recorder.mjs) answers transcribe-chunk itself and reads window.studiplyRecorder.
 * A release build sends you home.
 */

declare global {
  interface Window {
    /** The recorder's state, chunks and live transcript, for the Chrome check. */
    studiplyRecorder?: {
      lectureId: string | null;
      state: RecorderState;
      elapsedMs: number;
      interrupted: string[];
      chunks: ChunkInfo[];
      transcript: Segment[];
      error: string | null;
    };
  }
}

const time = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const STATE_LABEL: Record<ChunkInfo['state'], string> = {
  'on-device': 'saved on this device',
  uploaded: 'uploaded',
  transcribed: 'transcribed',
  'no-transcript': 'uploaded, no transcript',
};

export default function RecorderDev() {
  const params = useLocalSearchParams<{ chunk?: string; overlap?: string }>();
  const styles = useThemedStyles(makeStyles);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const connection = useSyncExternalStore(onConnection, getConnection, getConnection);
  const [state, setState] = useState<RecorderState>(recorder.state());
  const [lectureId, setLectureId] = useState<string | null>(recorder.state().lectureId);
  const [interrupted, setInterrupted] = useState<string[]>([]);
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [transcript, setTranscript] = useState<Segment[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const now = recorder.state();
    setState(now);
    const id = now.lectureId ?? lectureId;
    if (!id) return;
    const snap = await recorder.snapshot(id);
    setChunks(snap.chunks);
    setTranscript(snap.transcript);
  }, [lectureId]);

  useEffect(() => recorder.subscribe(() => void refresh()), [refresh]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A recording this page (or another before it) lost.
  useEffect(() => {
    if (!userId || !recorder.supported) return;
    void recorder
      .recover()
      .then((found) => {
        const ids = found.filter((m) => m.status === 'interrupted').map((m) => m.lectureId);
        setInterrupted(ids);
        if (ids.length) setLectureId((current) => current ?? ids[0]);
      })
      .catch((err) => setError(errorMessage(err, 'Could not look for interrupted recordings')));
  }, [userId]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(recorder.elapsedMs()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    window.studiplyRecorder = { lectureId, state, elapsedMs: elapsed, interrupted, chunks, transcript, error };
  }, [lectureId, state, elapsed, interrupted, chunks, transcript, error]);

  if (!__DEV__) return <Redirect href="/" />;

  const act = async (what: string, fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(`${what}: ${errorMessage(err, 'unknown error')}`);
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const start = () =>
    act('Could not start', async () => {
      if (!userId) return;
      await ensureConsent('transcription');
      const settings = await getUserSettings(userId).catch(() => null);
      const now = new Date();
      const lecture = await createSession({
        userId,
        title: `Recorder test ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        recordingMode: 'lecture',
        language: settings?.default_language ?? 'en',
      });
      setLectureId(lecture.id);
      setChunks([]);
      setTranscript([]);
      await recorder.start({
        lectureId: lecture.id,
        transcribe: true,
        chunkMs: params.chunk ? Math.max(2, Number(params.chunk) || 30) * 1000 : CHUNK_MS,
        overlapMs: params.overlap ? Math.max(0, Number(params.overlap) || 0) : OVERLAP_MS,
      });
    });

  const status = state.status;
  const idle = status === 'idle';
  const button = (label: string, a11y: string, onPress: () => void, enabled: boolean) => (
    <Pressable onPress={onPress} disabled={!enabled || busy} style={[styles.button, (!enabled || busy) && styles.off]} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <GradientFill />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Recorder service (step 5.2)</Text>
        {Platform.OS !== 'web' || !recorder.supported ? (
          <Text style={styles.text}>Web only for now: the iPhone recorder waits for expo-audio (Lea’s OK).</Text>
        ) : (
          <>
            <View style={styles.row}>
              {button('Start', 'Start recording', () => void start(), idle && !!userId)}
              {button('Pause', 'Pause recording', () => void act('Could not pause', () => recorder.pause()), status === 'recording')}
              {button('Resume', 'Resume recording', () => void act('Could not resume', () => recorder.resume()), status === 'paused')}
              {button('Stop', 'Stop recording', () => void act('Could not stop', () => recorder.stop()), status === 'recording' || status === 'paused')}
              <Text style={styles.text} {...{ dataSet: { recorder: 'status' } }}>
                {status} · {time(elapsed)} · {connection}
                {lectureId ? ` · lecture ${lectureId.slice(0, 8)}` : ''}
              </Text>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {interrupted.map((id) => (
              <View key={id} style={styles.row}>
                <Text style={styles.text}>Interrupted recording · lecture {id.slice(0, 8)}</Text>
                {button(
                  'Continue',
                  'Continue recording',
                  () =>
                    void act('Could not continue', async () => {
                      setLectureId(id);
                      await recorder.continueRecording(id);
                      setInterrupted((list) => list.filter((x) => x !== id));
                    }),
                  idle,
                )}
                {button(
                  'Finish',
                  'Finish recording',
                  () =>
                    void act('Could not finish', async () => {
                      await recorder.finish(id);
                      setInterrupted((list) => list.filter((x) => x !== id));
                    }),
                  idle,
                )}
              </View>
            ))}
            <Text style={styles.heading}>Chunks</Text>
            {chunks.map((c) => (
              <Text key={c.seq} style={styles.mono} {...{ dataSet: { recorderChunk: String(c.seq) } }}>
                #{c.seq} at {time(c.startMs)} · {(c.durationMs / 1000).toFixed(2)} s · {Math.round(c.sizeBytes / 1024)} KB · {STATE_LABEL[c.state]}
                {c.recovered ? ' · recovered' : ''}
                {c.transcriptError ? ` · ${c.transcriptError}` : ''}
              </Text>
            ))}
            <Text style={styles.heading}>Live transcript</Text>
            <View {...{ dataSet: { recorder: 'transcript' } }}>
              {transcript.map((s, i) => (
                <Text key={`${s.startMs}-${i}`} style={styles.text}>
                  {time(s.startMs)} {s.text}
                </Text>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1 },
    content: { padding: 24, gap: 10, maxWidth: 900 },
    title: { fontSize: Typography.size.lg, fontWeight: Typography.weight.semibold, color: c.text.onGradientStrong },
    heading: { marginTop: 12, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.onGradientStrong },
    text: { fontSize: Typography.size.sm, color: c.text.onGradientStrong },
    error: { fontSize: Typography.size.sm, color: c.text.onGradientStrong, fontWeight: Typography.weight.semibold },
    mono: { fontSize: Typography.size.xs, color: c.text.onGradientStrong, fontVariant: ['tabular-nums'] },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    button: { height: 36, paddingHorizontal: 18, borderRadius: 10, justifyContent: 'center', backgroundColor: c.button.primary },
    buttonText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    off: { opacity: 0.4 },
  });
