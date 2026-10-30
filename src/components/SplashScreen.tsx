import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { gradientStops } from './GradientBackground';

export default function SplashScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(textOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <LinearGradient
      colors={gradientStops(colors)}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <Animated.View style={[styles.content, { opacity: textOpacity }]}>
        <Text style={styles.title}>STUDIPLY</Text>
        <Text style={styles.subtitle}>AUTOMATED STUDY</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.black,
    color: c.text.onGradientStrong,
    letterSpacing: 8,
  },
  subtitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
    color: c.text.onGradient,
    letterSpacing: Typography.tracking.widest,
  },
});
