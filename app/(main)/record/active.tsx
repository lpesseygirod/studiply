import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler,
  Platform,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { Audio } from 'expo-av';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { updateSession } from '../../../src/services/session.service';
import { createSourceFile } from '../../../src/services/source-file.service';
import { uploadSourceFile } from '../../../src/services/storage.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

const MODE_LABELS: Record<string, string> = {
  lecture: 'LECTURE MODE',
  standard: 'STANDARD MODE',
  discussion: 'DISCUSSION MODE',
};

// ─── Recording constants ───────────────────────────────────────────────────────

const CHUNK_DURATION_MS = 20 * 60 * 1000;           // 20 minutes per chunk
const MAX_RECORDING_SECONDS = 3 * 60 * 60;          // 3-hour absolute maximum
const WARN_AT_SECONDS = MAX_RECORDING_SECONDS - 5 * 60; // warn at 2h55m

// Speech-optimised preset: mono, 22kHz, 32kbps ≈ 5MB per 20-min chunk
const LECTURE_RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: '.m4a',
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 32000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32000,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActiveRecordingScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();
  const { sessionId, title, mode } = useLocalSearchParams<{
    sessionId: string;
    title: string;
    mode: string;
  }>();

  // ── Recording refs ───────────────────────────────────────────
  const currentRecordingRef = useRef<Audio.Recording | null>(null);
  const audioChunksRef      = useRef<string[]>([]);
  const chunkTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkStartTimeRef   = useRef<number>(0);           // wall-clock ms when current chunk began
  const chunkRemainingMsRef = useRef<number>(CHUNK_DURATION_MS); // ms left in current chunk slot

  // ── State ────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [startError, setStartError] = useState('');
  const [showLimitWarning, setShowLimitWarning] = useState(false);

  // Re-entry guard for doStop (also keeps auto-stop from firing twice)
  const isStoppingRef = useRef(false);

  // ── Timer ────────────────────────────────────────────────────
  const effectiveStartRef = useRef<number>(0); // adjusted for pauses
  const pauseStartRef     = useRef<number>(0);
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const startTimer = () => {
    effectiveStartRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - effectiveStartRef.current) / 1000));
    }, 500);
  };

  const pauseTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pauseStartRef.current = Date.now();
  };

  const resumeTimer = () => {
    effectiveStartRef.current += Date.now() - pauseStartRef.current;
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - effectiveStartRef.current) / 1000));
    }, 500);
  };

  const stopTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  // ── Pulse animation ──────────────────────────────────────────
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.65, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseLoopRef.current?.stop();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  // ── Chunk rotation ───────────────────────────────────────────
  // useCallback([]) is correct: this function only accesses refs and constants,
  // so it never needs to update its closure.
  const rotateChunk = useCallback(async () => {
    try {
      const old = currentRecordingRef.current;
      if (old) {
        await old.stopAndUnloadAsync();
        const uri = old.getURI();
        if (uri) audioChunksRef.current.push(uri);
      }
      // Gap between chunks is ~100–300ms — imperceptible in a lecture.
      const { recording } = await Audio.Recording.createAsync(LECTURE_RECORDING_OPTIONS);
      currentRecordingRef.current = recording;
    } catch (e) {
      console.error('[active] Chunk rotation failed:', e);
      // Non-fatal: recording stays in whatever state it was.
    }
  }, []);

  // scheduleChunkTimer depends only on rotateChunk (which is stable), so it
  // is itself stable and safe to pass as a dependency or call from a timer.
  const scheduleChunkTimer = useCallback((delayMs: number) => {
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    chunkStartTimeRef.current = Date.now();
    chunkTimerRef.current = setTimeout(async () => {
      await rotateChunk();
      chunkRemainingMsRef.current = CHUNK_DURATION_MS;
      scheduleChunkTimer(CHUNK_DURATION_MS); // recursive — always the stable reference
    }, delayMs);
  }, [rotateChunk]);

  const clearChunkTimer = useCallback(() => {
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  // ── Start recording on mount ─────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const begin = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });

        const { recording } = await Audio.Recording.createAsync(LECTURE_RECORDING_OPTIONS);

        if (!mounted) {
          await recording.stopAndUnloadAsync().catch(() => {});
          return;
        }

        audioChunksRef.current      = [];
        currentRecordingRef.current = recording;
        chunkRemainingMsRef.current = CHUNK_DURATION_MS;

        setIsRecording(true);
        startTimer();
        startPulse();
        scheduleChunkTimer(CHUNK_DURATION_MS);
      } catch (err: any) {
        if (!mounted) return;
        setStartError(err?.message ?? 'Failed to start recording.');
      }
    };

    begin();

    return () => {
      mounted = false;
      stopTimer();
      stopPulse();
      clearChunkTimer();
      if (currentRecordingRef.current) {
        currentRecordingRef.current.stopAndUnloadAsync().catch(() => {});
        currentRecordingRef.current = null;
      }
      Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pulse follows pause/resume ───────────────────────────────
  useEffect(() => {
    if (isRecording && !isPaused) startPulse();
    else stopPulse();
  }, [isRecording, isPaused, startPulse, stopPulse]);

  // ── 3-hour hard limit ────────────────────────────────────────
  const doStopRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (elapsed >= WARN_AT_SECONDS && !showLimitWarning) {
      setShowLimitWarning(true);
    }
    if (elapsed >= MAX_RECORDING_SECONDS && !isStoppingRef.current) {
      Alert.alert('3-Hour Limit Reached', 'Your recording was automatically saved.');
      doStopRef.current();
    }
  }, [elapsed, showLimitWarning]);

  // ── Android back ─────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        showExitAlert();
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  // ── Pause / Resume ───────────────────────────────────────────
  const handlePauseResume = async () => {
    if (!currentRecordingRef.current || isStoppingRef.current) return;
    try {
      if (isPaused) {
        await currentRecordingRef.current.startAsync();
        resumeTimer();
        scheduleChunkTimer(chunkRemainingMsRef.current);
        setIsPaused(false);
      } else {
        await currentRecordingRef.current.pauseAsync();
        pauseTimer();
        // Store how many ms remain in the current 20-min slot.
        const elapsedInChunk = Date.now() - chunkStartTimeRef.current;
        chunkRemainingMsRef.current = Math.max(0, chunkRemainingMsRef.current - elapsedInChunk);
        clearChunkTimer();
        setIsPaused(true);
      }
    } catch {
      // Non-fatal — recording state unchanged
    }
  };

  // ── Stop recording ───────────────────────────────────────────
  const doStop = useCallback(async () => {
    if (isStoppingRef.current || !currentRecordingRef.current || !profile?.id || !sessionId) return;
    isStoppingRef.current = true;
    setIsStopping(true);
    stopTimer();
    stopPulse();
    clearChunkTimer();

    const finalDuration = Math.floor((Date.now() - effectiveStartRef.current) / 1000);

    try {
      // Stop the last chunk and collect its URI.
      await currentRecordingRef.current.stopAndUnloadAsync();
      const lastUri = currentRecordingRef.current.getURI();
      currentRecordingRef.current = null;
      if (lastUri) audioChunksRef.current.push(lastUri);

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      await updateSession(sessionId, {
        status: 'transcribing',
        duration_seconds: finalDuration,
      });

      // Persist one source_file per chunk; fire-and-forget uploads.
      const mimeType = Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4';
      const ext      = Platform.OS === 'ios' ? 'm4a' : 'mp4';

      for (let i = 0; i < audioChunksRef.current.length; i++) {
        const uri = audioChunksRef.current[i];
        if (!uri) continue;
        try {
          const sf = await createSourceFile({
            userId: profile.id,
            sessionId,
            fileType: 'audio',
            filePath: uri,
            mimeType,
          });
          uploadSourceFile({
            sourceFileId: sf.id,
            userId: profile.id,
            sessionId,
            localUri: uri,
            filename: `audio_chunk_${i}_${Date.now()}.${ext}`,
            mimeType,
          }).catch(() => {});
        } catch {
          // Non-fatal — local URI is still usable for transcription
        }
      }

      router.replace({
        pathname: '/record/post-session',
        params: { sessionId, title: title ?? '' },
      });
    } catch {
      isStoppingRef.current = false;
      setIsStopping(false);
      Alert.alert('Save Failed', 'Could not save the recording. Please try again.', [{ text: 'OK' }]);
    }
  }, [profile?.id, sessionId, title, stopPulse, clearChunkTimer]);

  // Keep the ref in sync so the auto-stop effect always calls the latest version.
  doStopRef.current = doStop;

  const handleStop = () => {
    Alert.alert('Sure?', '', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: doStop },
    ]);
  };

  const showExitAlert = () => {
    Alert.alert('Recording in Progress', 'Stop recording before leaving this screen.', [{ text: 'OK' }]);
  };

  // ── Error state ──────────────────────────────────────────────
  if (startError) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar style="light" />
        <Text style={styles.errorText}>{startError}</Text>
        <TouchableOpacity style={styles.errorBackButton} onPress={() => router.back()}>
          <Text style={styles.errorBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusText = isPaused ? 'RECORDING PAUSED' : 'RECORDING IN PROCESS';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <StatusBar style="light" />

      {/* ── 3-hour warning banner (absolute, non-intrusive) ─── */}
      {showLimitWarning && (
        <View style={[styles.limitBanner, { top: insets.top + 4 }]}>
          <Text style={styles.limitBannerText}>
            Recording will auto-stop in 5 minutes (3 hour limit)
          </Text>
        </View>
      )}

      <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}>

        {/* ── App title ──────────────────────────────────────── */}
        <Text style={styles.appTitle}>STUDIPLY</Text>

        {/* ── Status ─────────────────────────────────────────── */}
        <Text style={styles.statusText}>{statusText}</Text>
        <Text style={styles.sessionTitle} numberOfLines={2}>{title ?? ''}</Text>

        <View style={{ flex: 1 }} />

        {/* ── Timer ──────────────────────────────────────────── */}
        <Text style={styles.timer}>{formatTime(elapsed)}</Text>

        {/* ── Mode badge ─────────────────────────────────────── */}
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>
            {MODE_LABELS[mode] ?? mode?.toUpperCase() ?? 'STANDARD MODE'}
          </Text>
        </View>

        {/* ── Max time indicator ─────────────────────────────── */}
        <Text style={styles.maxTimeText}>Max: 3 hours</Text>

        <View style={{ flex: 1 }} />

        {/* ── Stop button (pulse ring) ────────────────────────── */}
        <View style={styles.stopButtonWrapper}>
          <Animated.View style={{ opacity: isStopping ? 0.5 : pulseAnim }}>
            <TouchableOpacity onPress={handleStop} disabled={isStopping} activeOpacity={0.8}>
              <LinearGradient
                colors={[Colors.gradient.top, Colors.salmon, Colors.gradient.bottomEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.stopButtonRing}
              >
                <View style={styles.stopButtonInner}>
                  {isStopping ? (
                    <Ionicons name="hourglass-outline" size={28} color={Colors.white} />
                  ) : (
                    <Text style={styles.stopLabel}>STOP</Text>
                  )}
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* ── Pause / Resume ─────────────────────────────────── */}
        <TouchableOpacity
          style={styles.pauseButton}
          onPress={handlePauseResume}
          disabled={isStopping || !isRecording}
          activeOpacity={0.75}
        >
          <Ionicons name={isPaused ? 'play' : 'pause'} size={20} color={Colors.white} />
          <Text style={styles.pauseButtonText}>{isPaused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STOP_RING_SIZE   = 130;
const STOP_RING_BORDER = 5;
const STOP_INNER_SIZE  = STOP_RING_SIZE - STOP_RING_BORDER * 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // Warning banner
  limitBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#C8860A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  limitBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFBE6',
    textAlign: 'center',
  },

  // Header
  appTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.extrabold,
    color: Colors.white,
    letterSpacing: Typography.tracking.widest,
    marginBottom: 20,
  },

  // Status
  statusText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: Typography.tracking.wider,
    textAlign: 'center',
    marginBottom: 8,
  },
  sessionTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: Typography.size.base * Typography.leading.relaxed,
  },

  // Timer
  timer: {
    fontSize: 56,
    fontWeight: Typography.weight.bold,
    color: Colors.white,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginBottom: 16,
  },

  // Mode badge
  modeBadge: {
    borderWidth: 1,
    borderColor: 'rgba(232,180,160,0.4)',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  modeBadgeText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: 'rgba(232,180,160,0.8)',
    letterSpacing: Typography.tracking.wide,
  },

  // Max time indicator
  maxTimeText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 8,
    letterSpacing: 0.5,
  },

  // Stop button
  stopButtonWrapper: {
    marginBottom: 24,
  },
  stopButtonRing: {
    width: STOP_RING_SIZE,
    height: STOP_RING_SIZE,
    borderRadius: STOP_RING_SIZE / 2,
    padding: STOP_RING_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonInner: {
    width: STOP_INNER_SIZE,
    height: STOP_INNER_SIZE,
    borderRadius: STOP_INNER_SIZE / 2,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopLabel: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.white,
    letterSpacing: 2,
  },

  // Pause button
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pauseButtonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: Colors.white,
  },

  // Error state
  errorText: {
    color: Colors.error,
    fontSize: Typography.size.base,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  errorBackButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 100,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorBackText: {
    color: Colors.white,
    fontSize: Typography.size.base,
  },
});
