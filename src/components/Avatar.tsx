import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

interface AvatarProps {
  /** Diameter in dp. Default: 40 */
  size?: number;
  /** Shown in the initials circle. */
  initials: string;
  /** Extra styles applied to the outer container. */
  style?: ViewStyle;
  /** Background color of the circle. Default: Colors.salmon */
  backgroundColor?: string;
  /** Initials text color. Default: Colors.text.primary */
  textColor?: string;
}

export default function Avatar({
  size = 40,
  initials,
  style,
  backgroundColor = Colors.salmon,
  textColor = Colors.text.primary,
}: AvatarProps) {
  const fontSize = Math.round(size * 0.35);
  const borderRadius = size / 2;

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius, backgroundColor },
        style,
      ]}
    >
      <Text style={[styles.initialsText, { fontSize, color: textColor }]} numberOfLines={1}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
