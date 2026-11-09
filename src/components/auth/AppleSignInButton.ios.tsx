import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { AppleButtonColors } from '../../constants/colors';

/** "Continue with Apple" on the iPhone (step 10.1; iphone-11): Apple's own button, black. */
export function AppleSignInButton({ onPress, busy, disabled }: { onPress: () => void; busy: boolean; disabled?: boolean }) {
  if (busy) {
    return (
      <View style={[styles.button, styles.busy]}>
        <ActivityIndicator color={AppleButtonColors.text} />
      </View>
    );
  }
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={25}
      style={[styles.button, disabled && styles.dim]}
      onPress={() => !disabled && onPress()}
    />
  );
}

const styles = StyleSheet.create({
  button: { height: 50, width: '100%' },
  busy: { borderRadius: 25, backgroundColor: AppleButtonColors.background, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
});
