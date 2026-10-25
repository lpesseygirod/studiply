import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { useRouter } from 'expo-router';

import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

type Router = ReturnType<typeof useRouter>;

/**
 * Leaves the recording flow (recording, post-session, review): closes the
 * record stack so the Record tab starts fresh next time, then opens
 * the Library. The lecture is already saved; it stays in the library and
 * opens at post-session until it has notes.
 */
export function leaveRecordingFlow(router: Router): void {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/library');
}

/**
 * The way out of a recording-flow screen, shown at its top left
 * (the tab bar is hidden on these screens).
 */
export default function FlowCloseButton({
  onPress,
  label = 'Library',
  tone = 'dark',
}: {
  onPress: () => void;
  label?: string;
  /** 'light' on the dark recording screen. */
  tone?: 'dark' | 'light';
}) {
  const color = tone === 'light' ? Colors.white : Colors.text.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.button}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      activeOpacity={0.7}
    >
      <Ionicons name="chevron-back" size={22} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingRight: 12,
    marginLeft: -6,
    marginBottom: 8,
  },
  label: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
});
