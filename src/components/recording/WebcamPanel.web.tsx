import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { formatHitTime } from '../../utils/searchText';
import type { Moment } from './markPanelState';
import { saveWebcamPhoto } from './photoBoard.web';

/**
 * The laptop's webcam for a board photo (step 5.6): the live picture (the
 * back camera when there is one; video only, never the microphone the
 * recording uses), Take photo and Cancel. The browser asks for the camera
 * the first time. The camera is let go as soon as the panel closes.
 */
export function WebcamPanel({ moment, onClose }: { moment: Moment; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'starting' | 'live' | 'unavailable'>('starting');

  useEffect(() => {
    let gone = false;
    const start = navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (!start) {
      setState('unavailable');
      return;
    }
    start
      .then((s) => {
        if (gone) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
        setState('live');
      })
      .catch(() => !gone && setState('unavailable'));
    return () => {
      gone = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  const take = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    onClose();
    if (jpeg) await saveWebcamPhoto(moment, jpeg, { width: canvas.width, height: canvas.height });
  };

  return (
    <View style={styles.panel} accessibilityLabel="Webcam" {...{ dataSet: { photo: 'webcam' } }}>
      <Text style={styles.title}>Photo board · {formatHitTime(moment.ms)}</Text>
      {state === 'unavailable' ? (
        <Text style={styles.note}>The camera isn’t available. Allow it for this site in the browser, or choose files instead.</Text>
      ) : (
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', maxHeight: 280, borderRadius: 10, objectFit: 'contain', background: c.photoBackdrop }}
        />
      )}
      <View style={styles.actions}>
        <View style={styles.flex} />
        <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => void take()}
          disabled={state !== 'live'}
          aria-disabled={state !== 'live'}
          style={({ pressed }) => [styles.primary, state !== 'live' && styles.off, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
        >
          <Text style={styles.primaryText}>Take photo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    panel: { gap: 10 },
    title: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary, fontVariant: ['tabular-nums'] },
    note: { fontSize: Typography.size.sm, color: c.text.secondary },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    flex: { flex: 1 },
    secondary: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' },
    cancel: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.secondary },
    primary: { minHeight: 40, paddingHorizontal: 18, borderRadius: 10, justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    off: { opacity: 0.45 },
    pressed: { opacity: 0.85 },
  });
