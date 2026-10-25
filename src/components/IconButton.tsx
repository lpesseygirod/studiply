import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * A button that shows only an icon (step 2.3): always at least 44×44 pt,
 * and always named for VoiceOver / screen readers (`label`), since the
 * icon alone says nothing to them.
 */
export function IconButton({
  icon,
  label,
  onPress,
  color,
  size = 22,
  disabled,
  hint,
  style,
  testID,
  compact,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  /** What the button does, read by VoiceOver ("Back", "Remove tag"). */
  label: string;
  onPress: () => void;
  color: string;
  size?: number;
  disabled?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * Inside a small chip: keep the icon's size and reach 44 pt with an
   * invisible touch margin instead.
   */
  compact?: boolean;
}) {
  const slop = compact ? Math.max(0, Math.ceil((44 - size) / 2)) : 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={slop}
      style={({ pressed }) => [style, !compact && styles.target, (pressed || disabled) && styles.dim]}
      testID={testID}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
});
