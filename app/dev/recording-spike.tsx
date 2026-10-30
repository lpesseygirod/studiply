import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';

import type { ThemeColors } from '../../src/constants/colors';
import { Typography } from '../../src/constants/typography';
import { useThemedStyles } from '../../src/theme/ThemeProvider';
import { GradientFill } from '../../src/components/GradientBackground';
import { useAuth } from '../../src/hooks/useAuth';
import { ChunkRecorder, type RecordedChunk } from '../../src/lib/chunkRecorder';
import { callFunction } from '../../src/lib/functions';
import { ensureConsent } from '../../src/services/consent.service';
import { createSession } from '../../src/services/session.service';
import { getUserSettings } from '../../src/services/settings.service';
import { createSourceFile } from '../../src/services/source-file.service';
import { errorMessage } from '../../src/utils/errors';

/**
 * Development only (step 5.1, the spike, web half): record in chunks with the
 * browser's MediaRecorder, upload each chunk through the app's path
 * (audio-chunks, audio_chunks) and send it to transcribe-chunk, showing the
 * transcript as it arrives. A release build sends you home.
 *   /dev/recording-spike                    30-second chunks, restarted
 *   /dev/recording-spike?chunk=10&overlap=500   10-second chunks overlapping by 500 ms
 * Start makes a lecture "Recording spike HH:MM" in My library; on a real
 * account the transcription is real (it costs). The Chrome check (spike.mjs)
 * answers transcribe-chunk itself and reads window.studiplySpike.
 */

type ChunkState = { seq: number; startMs: number; durationMs: number; size: number; mimeType: string; uploaded: boolean; transcribed: boolean; error: string | null };
type Segment = { startMs: number; endMs: number; text: string };

declare global {
  interface Window {
    /** The spike's chunks and transcript, for the Chrome check. */
    studiplySpike?: { lectureId: string | null; chunks: (RecordedChunk & { uploaded: boolean; transcribed: boolean })[]; transcript: Segment[] };
  }
}

const time = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function RecordingSpike() {
  const params = useLocalSearchParams<{ chunk?: string; overlap?: string }>();
  const styles = useThemedStyles(makeStyles);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [chunkS, setChunkS] = useState(params.chunk ?? '30');
  const [overlapMs, setOverlapMs] = useState(params.overlap ?? '0');
  const [status, setStatus] = useState('Ready');
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkState[]>([]);
  const [transcript, setTranscript] = useState<Segment[]>([]);
  const recorder = useRef<ChunkRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  // Uploads and transcriptions one after another, in the chunks' order.
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(
    () => () => {
      void recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  if (!__DEV__) return <Redirect href="/" />;
  const web = Platform.OS === 'web';

  const update = (seq: number, change: Partial<ChunkState>) => setChunks((list) => list.map((c) => (c.seq === seq ? { ...c, ...change } : c)));
  const exposed = () => {
    if (!window.studiplySpike) window.studiplySpike = { lectureId: null, chunks: [], transcript: [] };
    return window.studiplySpike;
  };

  const handle = (lecture: string, chunk: RecordedChunk) => {
    exposed().chunks.push({ ...chunk, uploaded: false, transcribed: false });
    setChunks((list) => [...list, { seq: chunk.seq, startMs: chunk.startMs, durationMs: chunk.durationMs, size: chunk.blob.size, mimeType: chunk.mimeType, uploaded: false, transcribed: false, error: null }]);
    queue.current = queue.current.then(async () => {
      const mark = (change: { uploaded?: boolean; transcribed?: boolean }) => {
        const kept = exposed().chunks.find((c) => c.seq === chunk.seq);
        if (kept) Object.assign(kept, change);
        update(chunk.seq, change);
      };
      try {
        const url = URL.createObjectURL(chunk.blob);
        const file = await createSourceFile({
          userId: userId!,
          sessionId: lecture,
          fileType: 'audio',
          filePath: url,
          fileSizeBytes: chunk.blob.size,
          seq: chunk.seq,
          startMs: chunk.startMs,
          durationMs: chunk.durationMs,
        });
        URL.revokeObjectURL(url);
        mark({ uploaded: true });
        const { segments } = await callFunction<{ segments: Segment[] }>('transcribe-chunk', {
          lectureId: lecture,
          seq: chunk.seq,
          storagePath: file.storage_path,
          startMs: chunk.startMs,
        });
        mark({ transcribed: true });
        setTranscript((all) => {
          const next = [...all, ...segments].sort((a, b) => a.startMs - b.startMs);
          exposed().transcript = next;
          return next;
        });
      } catch (err) {
        update(chunk.seq, { error: errorMessage(err, 'Failed') });
      }
    });
  };

  const start = async () => {
    if (!userId) return;
    try {
      setStatus('Starting…');
      await ensureConsent('transcription');
      const settings = await getUserSettings(userId).catch(() => null);
      const now = new Date();
      const lecture = await createSession({
        userId,
        title: `Recording spike ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        recordingMode: 'lecture',
        language: settings?.default_language ?? 'en',
      });
      setLectureId(lecture.id);
      window.studiplySpike = { lectureId: lecture.id, chunks: [], transcript: [] };
      setChunks([]);
      setTranscript([]);
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      recorder.current = new ChunkRecorder({
        chunkMs: Math.max(2, Number(chunkS) || 30) * 1000,
        overlapMs: Math.max(0, Number(overlapMs) || 0),
        onChunk: (c) => handle(lecture.id, c),
      });
      recorder.current.start(stream.current);
      setStatus('Recording');
    } catch (err) {
      setStatus(`Could not start: ${errorMessage(err, 'unknown error')}`);
    }
  };

  const stop = async () => {
    setStatus('Stopping…');
    await recorder.current?.stop();
    recorder.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    await queue.current;
    setStatus('Stopped');
  };

  const recording = status === 'Recording';
  return (
    <View style={styles.screen}>
      <GradientFill />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Recording spike (step 5.1)</Text>
        {!web ? (
          <Text style={styles.text}>Web only for now: the iPhone half waits for expo-audio (Lea’s OK).</Text>
        ) : (
          <>
            <View style={styles.row}>
              <Text style={styles.text}>Chunk (s)</Text>
              <TextInput value={chunkS} onChangeText={setChunkS} editable={!recording} style={styles.input} accessibilityLabel="Chunk length in seconds" />
              <Text style={styles.text}>Overlap (ms)</Text>
              <TextInput value={overlapMs} onChangeText={setOverlapMs} editable={!recording} style={styles.input} accessibilityLabel="Overlap in milliseconds" />
            </View>
            <View style={styles.row}>
              <Pressable onPress={() => void start()} disabled={recording || !userId} style={[styles.button, (recording || !userId) && styles.off]} accessibilityRole="button" accessibilityLabel="Start recording">
                <Text style={styles.buttonText}>Start</Text>
              </Pressable>
              <Pressable onPress={() => void stop()} disabled={!recording} style={[styles.button, !recording && styles.off]} accessibilityRole="button" accessibilityLabel="Stop recording">
                <Text style={styles.buttonText}>Stop</Text>
              </Pressable>
              <Text style={styles.text} {...{ dataSet: { spike: 'status' } }}>
                {status}
                {lectureId ? ` · lecture ${lectureId.slice(0, 8)}` : ''}
              </Text>
            </View>
            <Text style={styles.heading}>Chunks</Text>
            {chunks.map((c) => (
              <Text key={c.seq} style={styles.mono} {...{ dataSet: { spikeChunk: String(c.seq) } }}>
                #{c.seq} at {time(c.startMs)} · {(c.durationMs / 1000).toFixed(2)} s · {Math.round(c.size / 1024)} KB · {c.mimeType} · {c.uploaded ? 'uploaded' : 'uploading…'} · {c.transcribed ? 'transcribed' : c.error ?? '…'}
              </Text>
            ))}
            <Text style={styles.heading}>Live transcript</Text>
            <View {...{ dataSet: { spike: 'transcript' } }}>
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
    mono: { fontSize: Typography.size.xs, color: c.text.onGradientStrong, fontVariant: ['tabular-nums'] },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    input: { width: 70, height: 34, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.text.primary },
    button: { height: 36, paddingHorizontal: 18, borderRadius: 10, justifyContent: 'center', backgroundColor: c.button.primary },
    buttonText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    off: { opacity: 0.4 },
  });
