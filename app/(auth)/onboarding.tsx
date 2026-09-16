import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listProfiles, signIn, signUpAnonymous } from '../../src/services/auth.service';
import { useAuth } from '../../src/hooks/useAuth';
import { generateInitials } from '../../src/utils/initials';
import { Colors } from '../../src/constants/colors';
import { Typography } from '../../src/constants/typography';
import Avatar from '../../src/components/Avatar';
import type { Profile } from '../../src/types/database';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useAuth();

  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingProfiles, setExistingProfiles] = useState<Profile[]>([]);

  // Profiles already on this device. After a sign-out these are the way back
  // in — without them, the only option would be creating a second profile and
  // leaving the first one's notes stranded.
  useEffect(() => {
    listProfiles()
      .then(setExistingProfiles)
      .catch(() => setExistingProfiles([]));
  }, []);

  const canContinue = username.trim().length >= 2 && !isLoading;

  const handleContinue = useCallback(async () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    setError(null);
    setIsLoading(true);

    try {
      await signUpAnonymous(username.trim());
      // Refresh profile in AuthProvider → triggers navigation to (main)
      await refreshProfile();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [canContinue, username, refreshProfile]);

  const handleResume = useCallback(
    async (profile: Profile) => {
      if (isLoading) return;
      Keyboard.dismiss();
      setError(null);
      setIsLoading(true);

      try {
        await signIn(profile.id);
        await refreshProfile();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Could not open that profile.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, refreshProfile],
  );

  // Live initials preview
  const initials = username.trim().length >= 1 ? generateInitials(username) : null;

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
            <Text style={styles.inputLabel}>Your username</Text>

            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (error) setError(null);
              }}
              placeholder="Enter your name..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleContinue}
              maxLength={40}
              editable={!isLoading}
            />

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
                  Continue
                </Text>
              )}
            </TouchableOpacity>

            {/* Resume an existing profile on this device */}
            {existingProfiles.length > 0 && (
              <View style={styles.resumeBlock}>
                <Text style={styles.resumeLabel}>Or continue as</Text>
                {existingProfiles.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.resumeRow}
                    onPress={() => handleResume(p)}
                    disabled={isLoading}
                    activeOpacity={0.75}
                  >
                    <Avatar
                      size={32}
                      initials={p.initials}
                      backgroundColor="rgba(0,0,0,0.15)"
                      textColor={Colors.black}
                    />
                    <Text style={styles.resumeName} numberOfLines={1}>
                      {p.display_name ?? p.username}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },

  // ── Brand ──
  brandBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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

  // ── Resume existing profile ──
  resumeBlock: {
    marginTop: 8,
    gap: 8,
  },
  resumeLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.black,
    letterSpacing: Typography.tracking.wider,
    textTransform: 'uppercase',
    textAlign: 'center',
    opacity: 0.7,
  },
  resumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 100,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  resumeName: {
    flex: 1,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: Colors.black,
  },
});
