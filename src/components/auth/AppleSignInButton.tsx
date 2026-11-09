import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppleButtonColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

/**
 * "Continue with Apple" (step 10.1; desktop-06): black, Apple's logo and wording, as Apple's
 * guidelines ask for a button drawn by the app. The iPhone uses Apple's own button
 * (AppleSignInButton.ios.tsx).
 */
export function AppleSignInButton({ onPress, busy, disabled }: { onPress: () => void; busy: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [styles.button, (busy || disabled) && styles.dim, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Continue with Apple"
      {...{ dataSet: { auth: 'apple' } }}
    >
      {busy ? (
        <ActivityIndicator color={AppleButtonColors.text} />
      ) : (
        <>
          <Ionicons name="logo-apple" size={18} color={AppleButtonColors.text} />
          <Text style={styles.text}>Continue with Apple</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { height: 50, borderRadius: 12, backgroundColor: AppleButtonColors.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  text: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: AppleButtonColors.text },
  dim: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
});
