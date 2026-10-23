import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AuthServiceError,
  MIN_PASSWORD_LENGTH,
  resendSignUpCode,
  resetPassword,
  sendPasswordResetCode,
  signIn,
  signUp,
  verifySignUpCode,
} from '../../src/services/auth.service';
import { generateInitials } from '../../src/utils/initials';
import { Colors } from '../../src/constants/colors';
import { Typography } from '../../src/constants/typography';
import Avatar from '../../src/components/Avatar';

// signUp → code (email confirmation) → signed in
// signIn → signed in, or → code when the email isn't confirmed yet
// signIn → "Forgot password?" → reset (code + new password) → signed in
// AuthProvider picks up the new session and the root layout navigates.
type Mode = 'signUp' | 'signIn' | 'code' | 'reset';

const TITLES: Record<Mode, string> = {
  signUp: 'Create your account',
  signIn: 'Welcome back',
  code: 'Check your email',
  reset: 'Choose a new password',
};

const BUTTONS: Record<Mode, string> = {
  signUp: 'Create account',
  signIn: 'Sign in',
  code: 'Confirm',
  reset: 'Save password',
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('signUp');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setCode('');
    if (next !== 'signIn' && next !== 'signUp') return;
    setPassword('');
  }, []);

  const hasEmail = email.trim().length > 0;
  const canContinue =
    !isLoading &&
    {
      signUp: name.trim().length >= 2 && hasEmail && password.length >= MIN_PASSWORD_LENGTH,
      signIn: hasEmail && password.length > 0,
      code: code.trim().length === 6,
      reset: code.trim().length === 6 && password.length >= MIN_PASSWORD_LENGTH,
    }[mode];

  // Runs one auth call with the shared loading / error handling.
  const run = useCallback(async (action: () => Promise<void>) => {
    Keyboard.dismiss();
    setError(null);
    setNotice(null);
    setIsLoading(true);
    try {
      await action();
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleContinue = useCallback(() => {
    if (!canContinue) return;

    if (mode === 'signUp') {
      run(async () => {
        await signUp(name, email, password);
        setMode('code');
        setNotice(`We sent a 6-digit code to ${email.trim()}.`);
      });
    } else if (mode === 'signIn') {
      run(async () => {
        try {
          await signIn(email, password);
        } catch (err: unknown) {
          if (err instanceof AuthServiceError && err.code === 'email_not_confirmed') {
            setMode('code');
            setCode('');
          }
          throw err;
        }
      });
    } else if (mode === 'code') {
      run(() => verifySignUpCode(email, code));
    } else {
      run(() => resetPassword(email, code, password));
    }
  }, [canContinue, mode, name, email, password, code, run]);

  const handleForgotPassword = useCallback(() => {
    if (!hasEmail) {
      setError('Enter your email first, then tap “Forgot password?”.');
      emailRef.current?.focus();
      return;
    }
    run(async () => {
      await sendPasswordResetCode(email);
      setMode('reset');
      setCode('');
      setPassword('');
      setNotice(`We sent a 6-digit code to ${email.trim()}.`);
    });
  }, [hasEmail, email, run]);

  const handleResend = useCallback(() => {
    run(async () => {
      if (mode === 'reset') {
        await sendPasswordResetCode(email);
      } else {
        await resendSignUpCode(email);
      }
      setNotice(`We sent a new code to ${email.trim()}.`);
    });
  }, [mode, email, run]);

  // Live initials preview while creating an account
  const initials =
    mode === 'signUp' && name.trim().length >= 1 ? generateInitials(name) : null;

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <StatusBar style="dark" />

        {/* Full-screen gradient background */}
        <LinearGradient
          colors={[
            Colors.gradient.top,
            Colors.gradient.topMid,
            Colors.gradient.mid,
            Colors.gradient.bottomMid,
            Colors.gradient.bottom,
            Colors.gradient.bottomEnd,
          ]}
          locations={[0, 0.18, 0.38, 0.58, 0.78, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <KeyboardAvoidingView
          style={[styles.keyboardView, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Brand block ── */}
            <View style={styles.brandBlock}>
              {/* Initials preview circle — visible once user starts typing */}
              {initials && (
                <Avatar
                  size={64}
                  initials={initials}
                  backgroundColor="rgba(0,0,0,0.15)"
                  textColor={Colors.black}
                  style={styles.initialsCircle}
                />
              )}

              <Text style={styles.appTitle}>STUDIPLY</Text>
              <Text style={styles.appSubtitle}>Automative Study</Text>
            </View>

            {/* ── Input block ── */}
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>{TITLES[mode]}</Text>

              {notice && <Text style={styles.noticeText}>{notice}</Text>}

              {mode === 'signUp' && (
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    clearError();
                  }}
                  placeholder="Your name"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="name"
                  autoComplete="name"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  maxLength={40}
                  editable={!isLoading}
                />
              )}

              {(mode === 'signUp' || mode === 'signIn') && (
                <>
                  <TextInput
                    ref={emailRef}
                    style={styles.input}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      clearError();
                    }}
                    placeholder="Email"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType={mode === 'signUp' ? 'username' : 'emailAddress'}
                    autoComplete="email"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    editable={!isLoading}
                  />
                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      clearError();
                    }}
                    placeholder={
                      mode === 'signUp' ? `Password (${MIN_PASSWORD_LENGTH}+ characters)` : 'Password'
                    }
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
                    autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                    returnKeyType="go"
                    onSubmitEditing={handleContinue}
                    editable={!isLoading}
                  />
                </>
              )}

              {(mode === 'code' || mode === 'reset') && (
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(text) => {
                    setCode(text.replace(/\D/g, '').slice(0, 6));
                    clearError();
                  }}
                  placeholder="6-digit code"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  returnKeyType={mode === 'code' ? 'go' : 'next'}
                  onSubmitEditing={mode === 'code' ? handleContinue : () => passwordRef.current?.focus()}
                  maxLength={6}
                  editable={!isLoading}
                />
              )}

              {mode === 'reset' && (
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    clearError();
                  }}
                  placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  autoComplete="new-password"
                  returnKeyType="go"
                  onSubmitEditing={handleContinue}
                  editable={!isLoading}
                />
              )}

              {/* Error message */}
              {error && <Text style={styles.errorText}>{error}</Text>}

              {/* Continue button */}
              <TouchableOpacity
                style={[styles.button, !canContinue && styles.buttonDisabled]}
                onPress={handleContinue}
                disabled={!canContinue}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={[styles.buttonText, !canContinue && styles.buttonTextDisabled]}>
                    {BUTTONS[mode]}
                  </Text>
                )}
              </TouchableOpacity>

              {/* ── Secondary links ── */}
              <View style={styles.linkRow}>
                {mode === 'signUp' && (
                  <LinkButton
                    label="Already have an account? Sign in"
                    onPress={() => switchMode('signIn')}
                    disabled={isLoading}
                  />
                )}
                {mode === 'signIn' && (
                  <>
                    <LinkButton
                      label="Forgot password?"
                      onPress={handleForgotPassword}
                      disabled={isLoading}
                    />
                    <LinkButton
                      label="New to Studiply? Create an account"
                      onPress={() => switchMode('signUp')}
                      disabled={isLoading}
                    />
                  </>
                )}
                {(mode === 'code' || mode === 'reset') && (
                  <>
                    <LinkButton label="Send a new code" onPress={handleResend} disabled={isLoading} />
                    <LinkButton
                      label="Back to sign in"
                      onPress={() => switchMode('signIn')}
                      disabled={isLoading}
                    />
                  </>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

function LinkButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      style={styles.linkButton}
      accessibilityRole="button"
    >
      <Text style={styles.linkText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: 32,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },

  // ── Brand ──
  brandBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 32,
  },
  initialsCircle: {
    marginBottom: 20,
  },
  appTitle: {
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.extrabold,
    color: Colors.black,
    letterSpacing: Typography.tracking.widest,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: Colors.black,
    letterSpacing: Typography.tracking.wider,
    textAlign: 'center',
    opacity: 0.75,
    textTransform: 'uppercase',
  },

  // ── Input block ──
  inputBlock: {
    paddingBottom: 20,
    gap: 12,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  inputLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.black,
    letterSpacing: Typography.tracking.wider,
    textTransform: 'uppercase',
    textAlign: 'center',
    opacity: 0.7,
  },
  noticeText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.black,
    textAlign: 'center',
    opacity: 0.8,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 100, // pill shape
    paddingVertical: 18,
    paddingHorizontal: 28,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
    color: Colors.inputText,
    textAlign: 'center',
  },
  codeInput: {
    letterSpacing: Typography.tracking.widest,
  },
  errorText: {
    color: Colors.error,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    fontWeight: Typography.weight.medium,
  },
  button: {
    backgroundColor: Colors.button.primary,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  buttonDisabled: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  buttonText: {
    color: Colors.button.primaryText,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.wide,
  },
  buttonTextDisabled: {
    opacity: 0.5,
  },

  // ── Secondary links ──
  linkRow: {
    marginTop: 4,
    alignItems: 'center',
  },
  linkButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  linkText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.black,
    textAlign: 'center',
    opacity: 0.75,
  },
});
