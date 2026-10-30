import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { createAudioPlayer, type AudioPlayer } from '../../lib/audioPlayer';
import { isNetworkError } from '../../lib/cloudRows';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { chunkAt, endOf, getLecturePlayback, getLivePlayback, recordingLength, type PlaybackChunk } from '../../services/lecture-audio.service';
import { recorder } from '../../services/recorder';
import { formatHitTime } from '../../utils/searchText';

const STEP_MS = 10_000;

export interface PlayRequest {
  ms: number;
  /** A new tap on the same chip is a new request. */
  id: number;
}

/**
 * The mini player (step 4.6; BUILD-PLAN "Tap a timestamp to replay the
 * audio"): a tap on a timestamp chip plays the lecture's recording from that
 * moment, chunk after chunk (the recording is stored in 30-second pieces).
 * ▶ / ❚❚, −10 s, +10 s, the time and the length, ✕. Plays through
 * lib/audioPlayer (the one place that plays audio). The web's chunks
 * overlap by 500 ms: the next one starts where the last one ended, so
 * nothing is heard twice.
 *
 * While the lecture is being recorded (step 5.4) it plays from this
 * device's own copy (recorder.playback), never touching the recording
 * (CLAUDE.md), and says once to use headphones (the microphone would record
 * the sound again). Where the recorder can't (the iPhone until expo-audio),
 * it says when it can play.
 */
export function MiniPlayer({
  lectureId,
  recording,
  request,
  onClose,
}: {
  /** The lecture whose recording plays; null for a document without one. */
  lectureId: string | null;
  /** The lecture is being recorded now. */
  recording: boolean;
  request: PlayRequest | null;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const chunks = useRef<PlaybackChunk[] | null>(null);
  const index = useRef(0);
  const player = useRef<AudioPlayer | null>(null);
  const [length, setLength] = useState(0);
  // The chunks came from this device during the recording (read again on each tap; freed after).
  const live = useRef<{ release: () => void } | null>(null);
  const [hint, setHint] = useState(false);

  // One player for the screen; it stops when the screen goes.
  if (!player.current) {
    player.current = createAudioPlayer((s) => {
      const chunk = chunks.current?.[index.current];
      if (!chunk) return;
      setNow(chunk.startMs + s.positionMs);
      setPlaying(s.playing);
      // The end of a piece: on to the next, from where this one ended (past the overlap).
      if (s.finished && chunks.current && index.current < chunks.current.length - 1) void playFrom(endOf(chunks.current, index.current));
    });
  }
  useEffect(
    () => () => {
      void player.current?.unload();
      live.current?.release();
    },
    [],
  );
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(t);
  }, [hint]);

  const playFrom = async (ms: number) => {
    const list = chunks.current;
    const at = list && chunkAt(list, ms);
    if (!list || !at) return;
    index.current = at.index;
    setNow(list[at.index].startMs + at.offsetMs);
    await player.current?.load(list[at.index].url, at.offsetMs, true);
  };

  useEffect(() => {
    if (!request) return;
    let active = true;
    setMessage(null);
    if (!lectureId) return void setMessage('This document has no recording.');
    if (recording && !recorder.supported) return void setMessage('The recording plays here once it has stopped.');
    void (async () => {
      setLoading(true);
      try {
        if (recording) {
          // What this device has recorded so far, read again on every tap.
          const playback = await getLivePlayback(await recorder.playback(lectureId));
          live.current?.release();
          live.current = playback;
          if (!active) return;
          if (!playback.chunks.length) {
            setMessage('The first seconds are still being saved. Try again in a moment.');
            return;
          }
          chunks.current = playback.chunks;
          setLength(recordingLength(playback.chunks));
          void showHintOnce(setHint);
        } else if (!chunks.current || live.current) {
          // After the recording: from Storage (the device's copies are let go).
          live.current?.release();
          live.current = null;
          chunks.current = null;
          const playback = await getLecturePlayback(lectureId);
          if (!active) return;
          if (!playback.chunks.length) {
            setMessage(playback.deleted ? 'The recording was deleted (its audio setting).' : 'This lecture has no recording yet.');
            return;
          }
          chunks.current = playback.chunks;
          setLength(recordingLength(playback.chunks));
        }
        await playFrom(request.ms);
      } catch (err) {
        if (active) setMessage(isNetworkError(err) ? 'Playing the recording needs a connection.' : "The recording couldn't be played.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // A new request (a tap) plays; the rest is read when it comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  if (!request) return null;
  const close = () => {
    void player.current?.pause();
    setPlaying(false);
    onClose();
  };
  const button = (icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'], label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={styles.button} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialCommunityIcons name={icon} size={22} color={c.text.primary} />
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {hint && (
        <Text style={styles.hint} accessibilityLiveRegion="polite" aria-live="polite" {...{ dataSet: { player: 'hint' } }}>
          Use headphones: the recording is still running.
        </Text>
      )}
    <View style={styles.bar} accessibilityLabel="Recording player">
      {message ? (
        <Text style={styles.message}>{message}</Text>
      ) : (
        <>
          {button('rewind-10', 'Back 10 seconds', () => void playFrom(now - STEP_MS))}
          {loading ? (
            <View style={styles.button}>
              <ActivityIndicator color={c.accentDark} />
            </View>
          ) : (
            button(playing ? 'pause' : 'play', playing ? 'Pause' : 'Play', () => void (playing ? player.current?.pause() : player.current?.play()))
          )}
          {button('fast-forward-10', 'Forward 10 seconds', () => void playFrom(now + STEP_MS))}
          <Text style={styles.time} accessibilityLabel={`At ${formatHitTime(now)} of ${formatHitTime(length)}`}>
            {formatHitTime(now)} / {formatHitTime(length)}
          </Text>
        </>
      )}
      <View style={styles.flex} />
      {button('close', 'Close the player', close)}
    </View>
    </View>
  );
}

const HINT_MS = 6000;
const HINT_KEY = 'studiply.hint.headphones';

/** The first time this device plays during a recording: the quiet headphones line, once. */
async function showHintOnce(show: (on: boolean) => void): Promise<void> {
  try {
    if (await AsyncStorage.getItem(HINT_KEY)) return;
    await AsyncStorage.setItem(HINT_KEY, '1');
  } catch {
    // No storage: shown this time anyway.
  }
  show(true);
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    hint: {
      alignSelf: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      overflow: 'hidden',
      fontSize: Typography.size.xs,
      color: c.text.secondary,
      backgroundColor: c.card,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minHeight: 48,
      paddingHorizontal: 8,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    time: { marginLeft: 8, fontSize: Typography.size.sm, color: c.text.secondary, fontVariant: ['tabular-nums'] },
    message: { flexShrink: 1, marginLeft: 8, fontSize: Typography.size.sm, color: c.text.secondary },
    flex: { flex: 1 },
  });
