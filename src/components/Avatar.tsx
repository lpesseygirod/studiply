import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Buckets, getSignedUrl } from '../services/cloud-storage.service';

interface AvatarProps {
  /** Diameter in dp. Default: 40 */
  size?: number;
  /** Shown in the initials circle. */
  initials: string;
  /** Profile photo path in the photos bucket; initials show while it loads, offline or on error. */
  photoPath?: string | null;
  /** Extra styles applied to the outer container. */
  style?: ViewStyle;
  /** Background color of the circle. Default: the theme's salmon. */
  backgroundColor?: string;
  /** Initials text color. Default: the theme's primary text. */
  textColor?: string;
}

export default function Avatar({
  size = 40,
  initials,
  photoPath,
  style,
  backgroundColor: backgroundProp,
  textColor: textProp,
}: AvatarProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const backgroundColor = backgroundProp ?? c.salmon;
  const textColor = textProp ?? c.text.primary;
  const fontSize = Math.round(size * 0.35);
  const borderRadius = size / 2;

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPhotoUrl(null);
    setLoaded(false);
    if (!photoPath) return;
    let cancelled = false;
    getSignedUrl(Buckets.photos, photoPath)
      .then((url) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch(() => {
        // Offline or missing: keep the initials.
      });
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius, backgroundColor },
        style,
      ]}
    >
      {!loaded && (
        <Text style={[styles.initialsText, { fontSize, color: textColor }]} numberOfLines={1}>
          {initials}
        </Text>
      )}
      {photoUrl && (
        <Image
          source={{ uri: photoUrl }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          onLoad={() => setLoaded(true)}
          onError={() => setPhotoUrl(null)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initialsText: {
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.5,
  },
});
