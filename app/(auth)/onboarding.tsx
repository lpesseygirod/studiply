import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../src/constants/colors';
import { Typography } from '../../src/constants/typography';
import Avatar from '../../src/components/Avatar';
import { AppleSignInButton } from '../../src/components/auth/AppleSignInButton';
import { AppleSignInCancelled, isAppleSignInAvailable, signInWithApple } from '../../src/services/apple-auth';
import { LegalLinks } from '../../src/components/legal/LegalLinks';
import { LegalSheet } from '../../src/components/legal/LegalSheet';
import { TermsCheckboxes } from '../../src/components/legal/TermsCheckboxes';
import type { LegalSlug } from '../../src/legal/types';
import { rememberTicked, signUpAcceptance } from '../../src/services/terms.service';

// Step 10.1b-1: linked under the sign-in form (sign-up has the boxes, 10.1b-2).
const SIGN_IN_LEGAL_LINKS: readonly LegalSlug[] = ['terms', 'privacy'];

// signUp → code (email confirmation) → signed in
// signIn → signed in, or → code when the email isn't confirmed yet
// signIn → "Forgot password?" → reset (code + new password) → signed in
// AuthProvider picks up the new session and the root layout navigates.
// Step 10.1: Continue with Apple above the email form ("or with email", desktop-06); on the iPhone a
// welcome step first (iphone-11): Continue with Apple, Continue with email.
// Step 10.1b-1: the Terms and the Privacy Policy linked under sign-in, opened in a LegalSheet.
// Step 10.1b-2: sign-up has two required, unticked boxes (the Terms and the Privacy Policy, both
// linked; 16 or older): Create account stays greyed until both are ticked, and the acceptance goes
// with the sign-up (the server saves it with its own time). The iPhone's welcome has them where
// iphone-11's footer line was; ticked there, they carry to sign-up and count for Continue with
// Apple. An Apple account that never ticked is asked once after sign-in (TermsGateHost).
type Mode = 'welcome' | 'signUp' | 'signIn' | 'code' | 'reset';

const TITLES: Record<Mode, string> = {
  welcome: '',
  signUp: 'Create your account',
  signIn: 'Welcome back',
  code: 'Check your email',
  reset: 'Choose a new password',
};

const BUTTONS: Record<Mode, string> = {
  welcome: '',
  signUp: 'Create account',
  signIn: 'Sign in',
  code: 'Confirm',
  reset: 'Save password',
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export default function OnboardingScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>(Platform.OS === 'ios' ? 'welcome' : 'signUp');
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable).catch(() => {});
  }, []);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [legal, setLegal] = useState<LegalSlug | null>(null);
  const [termsTicked, setTermsTicked] = useState(false);
  const [ageTicked, setAgeTicked] = useState(false);
  const boxes = (
    <TermsCheckboxes terms={termsTicked} age={ageTicked} onTerms={setTermsTicked} onAge={setAgeTicked} onOpen={setLegal} disabled={isLoading} />
  );

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
      welcome: false,
      signUp: name.trim().length >= 2 && hasEmail && password.length >= MIN_PASSWORD_LENGTH && termsTicked && ageTicked,
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
        await signUp(name, email, password, signUpAcceptance());
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

  // Step 10.1: Sign in with Apple (a new account the first time); closing Apple's sheet says nothing.
  // Step 10.1b-2: boxes ticked on this screen count as accepting if Apple creates the account.
  const handleApple = useCallback(() => {
    rememberTicked(termsTicked && ageTicked);
    run(async () => {
      try {
        await signInWithApple();
      } catch (err) {
        if (err instanceof AppleSignInCancelled) return;
        throw err;
      }
    });
  }, [run, termsTicked, ageTicked]);

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
    <DismissKeyboardArea>
      <View style={styles.container}>
        <ThemedStatusBar />

        {/* Full-screen gradient background */}
        <LinearGradient
          colors={[
            c.gradient.top,
            c.gradient.topMid,
            c.gradient.mid,
            c.gradient.bottomMid,
            c.gradient.bottom,
            c.gradient.bottomEnd,
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
                  backgroundColor={c.scrim}
                  textColor={c.text.onGradientStrong}
                  style={styles.initialsCircle}
                />
              )}

              <Text style={styles.appTitle}>STUDIPLY</Text>
              <Text style={styles.appSubtitle}>Automated Study</Text>
            </View>

            {/* ── The iPhone's welcome (iphone-11) ── */}
            {mode === 'welcome' && (
              <View style={styles.inputBlock} {...{ dataSet: { auth: 'welcome' } }}>
                <Text style={styles.welcomeTitle}>Record the lecture.{'\n'}Keep your notes.{'\n'}Get the summary.</Text>
                <Text style={styles.welcomeText}>Your lectures, on your iPhone and laptop.</Text>
                {appleAvailable && <AppleSignInButton onPress={handleApple} busy={isLoading} />}
                <TouchableOpacity
                  style={styles.emailButton}
                  onPress={() => switchMode('signUp')}
                  disabled={isLoading}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  {...{ dataSet: { auth: 'email' } }}
                >
                  <Text style={styles.emailButtonText}>Continue with email</Text>
                </TouchableOpacity>
                {error && <Text style={styles.errorText}>{error}</Text>}
                {/* iphone-11's footer line, as the two boxes (step 10.1b-2). */}
                {boxes}
              </View>
            )}

            {/* ── Input block ── */}
            {mode !== 'welcome' && (
            <View style={styles.inputBlock}>
              {/* Step 10.1 (desktop-06): Continue with Apple, then the email form. */}
              {(mode === 'signUp' || mode === 'signIn') && appleAvailable && (
                <>
                  <AppleSignInButton onPress={handleApple} busy={isLoading} />
                  <View style={styles.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>or with email</Text>
                    <View style={styles.orLine} />
                  </View>
                </>
              )}
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
                  placeholderTextColor={c.inputPlaceholder}
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
                    placeholderTextColor={c.inputPlaceholder}
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
                    placeholderTextColor={c.inputPlaceholder}
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
                  placeholderTextColor={c.inputPlaceholder}
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
                  placeholderTextColor={c.inputPlaceholder}
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

              {/* Step 10.1b-2: the two required boxes (desktop-06's form; Create account greyed until both). */}
              {mode === 'signUp' && boxes}

              {/* Error message */}
              {error && <Text style={styles.errorText}>{error}</Text>}

              {/* Continue button */}
              <TouchableOpacity
                style={[styles.button, !canContinue && styles.buttonDisabled]}
                onPress={handleContinue}
                disabled={!canContinue}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canContinue }}
                {...{ dataSet: { auth: 'continue' } }}
              >
                {isLoading ? (
                  <ActivityIndicator color={c.white} size="small" />
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
              {/* Step 10.1b-1: the Terms and the Privacy Policy, in a sheet so the form is kept. */}
              {mode === 'signIn' && <LegalLinks slugs={SIGN_IN_LEGAL_LINKS} long onOpen={setLegal} />}
            </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
        <LegalSheet slug={legal} onClose={() => setLegal(null)} />
      </View>
    </DismissKeyboardArea>
  );
}

// Tapping outside the fields hides the iPhone keyboard. Not on web: there is
// no on-screen keyboard there, and React Native Web's Keyboard.dismiss()
// blurs the focused field, so every click on an input would unfocus it
// straight away and nothing could be typed.
function DismissKeyboardArea({ children }: { children: React.ReactElement }) {
  if (Platform.OS === 'web') return children;
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {children}
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
  const styles = useThemedStyles(makeStyles);
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
    color: c.black,
    letterSpacing: Typography.tracking.widest,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: c.black,
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
    color: c.black,
    letterSpacing: Typography.tracking.wider,
    textTransform: 'uppercase',
    textAlign: 'center',
    opacity: 0.7,
  },
  noticeText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: c.black,
    textAlign: 'center',
    opacity: 0.8,
  },
  input: {
    backgroundColor: c.inputBackground,
    borderRadius: 100, // pill shape
    paddingVertical: 18,
    paddingHorizontal: 28,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
    color: c.inputText,
    textAlign: 'center',
  },
  codeInput: {
    letterSpacing: Typography.tracking.widest,
  },
  errorText: {
    color: c.error,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    fontWeight: Typography.weight.medium,
  },
  button: {
    backgroundColor: c.button.primary,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  buttonDisabled: {
    backgroundColor: c.button.disabled,
  },
  buttonText: {
    color: c.button.primaryText,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.wide,
  },
  buttonTextDisabled: {
    opacity: 0.5,
  },

  // ── Step 10.1: Apple ──
  welcomeTitle: {
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.extrabold,
    color: c.text.onGradientStrong,
    lineHeight: 40,
  },
  welcomeText: {
    fontSize: Typography.size.base,
    color: c.text.onGradient,
    marginBottom: 12,
  },
  emailButton: {
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailButtonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.text.onGradient,
    opacity: 0.4,
  },
  orText: {
    fontSize: Typography.size.sm,
    color: c.text.onGradient,
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
    color: c.black,
    textAlign: 'center',
    opacity: 0.75,
  },
});
