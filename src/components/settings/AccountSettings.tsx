/**
 * AccountSettings.tsx
 * Moved unchanged from the old Manage Account and Security screens (step
 * 3.6): the profile card with its Edit profile sheet (name, photo), the
 * danger zone (Delete data on this device, Sign out) and what the account
 * keeps where.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '../../hooks/useAuth';
import { confirmAction } from '../../utils/confirm';
import { confirmSignOut } from '../../utils/signOut';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import UserAvatar from '../UserAvatar';
import { IconButton } from '../IconButton';
import { removeProfilePhoto, setProfilePhoto, updateProfile } from '../../services/profile.service';
import { deleteAllUserData } from '../../services/auth.service';
import { showAlert } from '../dialogs/dialogs';
import { makeSettingsStyles } from './styles';

// ── Profile ──────────────────────────────────────────────────────────────

export function ProfileCard({ title = 'PROFILE', subtitle }: { title?: string | null; subtitle?: string }) {
  const settingsStyles = useThemedStyles(makeSettingsStyles);
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();

  // Edit profile modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);

  const openEditModal = useCallback(() => {
    setEditName(profile?.username ?? '');
    setEditError('');
    setShowEditModal(true);
  }, [profile?.username]);

  const closeEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditError('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!profile?.id) return;
    const trimmedName = editName.trim();
    if (trimmedName.length < 2) {
      setEditError('Name must be at least 2 characters.');
      return;
    }
    setIsSaving(true);
    setEditError('');
    try {
      if (trimmedName !== profile.username) {
        await updateProfile(profile.id, {
          username: trimmedName,
          display_name: trimmedName,
        });
      }
      await refreshProfile();
      setShowEditModal(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [profile, editName, refreshProfile]);

  // Profile photo — uploads right after picking, separate from Save
  const handleChangePhoto = useCallback(async () => {
    if (!profile?.id) return;
    // The system photo picker needs no permission on iPhone.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;

    setEditError('');
    setPhotoStatus('Preparing photo…');
    try {
      await setProfilePhoto(profile.id, result.assets[0], profile.avatar_path, {
        onProgress: (fraction) => setPhotoStatus(`Uploading ${Math.round(fraction * 100)}%`),
        onRetry: (retry, max) => setPhotoStatus(`Connection problem. Retrying (${retry}/${max})…`),
      });
      await refreshProfile();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Could not upload your photo. Please try again.');
    } finally {
      setPhotoStatus(null);
    }
  }, [profile, refreshProfile]);

  const handleRemovePhoto = useCallback(async () => {
    if (!profile?.id || !profile.avatar_path) return;
    if (!(await confirmAction('Remove photo', 'Your initials will show instead.', 'Remove'))) return;

    setEditError('');
    setPhotoStatus('Removing photo…');
    try {
      await removeProfilePhoto(profile.id, profile.avatar_path);
      await refreshProfile();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Could not remove your photo. Please try again.');
    } finally {
      setPhotoStatus(null);
    }
  }, [profile, refreshProfile]);

  const isBusy = isSaving || photoStatus !== null;
  const username = profile?.username ?? '—';

  return (
    <>
      {title !== null && <Text style={settingsStyles.sectionHeader}>{title}</Text>}
      <View style={settingsStyles.card}>
        <View style={styles.profileRow}>
          <UserAvatar size={52} />

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{username}</Text>
            {!!subtitle && <Text style={styles.profileSubtitle}>{subtitle}</Text>}
            <TouchableOpacity onPress={openEditModal} activeOpacity={0.7}>
              <Text style={styles.editProfileLink}>Edit profile</Text>
            </TouchableOpacity>
          </View>
          <IconButton icon="pencil-outline" label="Edit profile" onPress={openEditModal} size={18} color={c.text.secondary} style={styles.editIconButton} />
        </View>
      </View>

      {/* Edit profile sheet (photo + name) */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={closeEditModal}>
        <Pressable style={settingsStyles.modalOverlay} onPress={closeEditModal}>
          <KeyboardAvoidingView style={styles.modalKAV} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable>
              <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
                <Text style={styles.modalTitle}>Edit Profile</Text>

                {/* Photo */}
                <View style={styles.modalAvatarSection}>
                  <UserAvatar size={80} />
                  {photoStatus ? (
                    <Text style={styles.photoStatusText}>{photoStatus}</Text>
                  ) : (
                    <View style={styles.photoActions}>
                      <TouchableOpacity
                        onPress={handleChangePhoto}
                        disabled={isBusy}
                        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                        accessibilityRole="button"
                      >
                        <Text style={styles.photoActionText}>{profile?.avatar_path ? 'Change photo' : 'Add photo'}</Text>
                      </TouchableOpacity>
                      {profile?.avatar_path ? (
                        <TouchableOpacity
                          onPress={handleRemovePhoto}
                          disabled={isBusy}
                          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                          accessibilityRole="button"
                        >
                          <Text style={styles.photoRemoveText}>Remove photo</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}
                </View>

                {/* Name */}
                <TextInput
                  style={styles.modalInput}
                  value={editName}
                  onChangeText={v => {
                    setEditName(v);
                    if (editError) setEditError('');
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  placeholder="Your name"
                  placeholderTextColor={c.text.placeholder}
                  editable={!isBusy}
                />

                {editError ? <Text style={styles.errorText}>{editError}</Text> : null}

                <TouchableOpacity
                  style={[styles.saveButton, isBusy && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={isBusy}
                  activeOpacity={0.85}
                >
                  {isSaving ? <ActivityIndicator color={c.white} size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={closeEditModal} activeOpacity={0.7} disabled={isSaving}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Where the account keeps things (from Security) ───────────────────────

/** Where the library is stored; with the name when it stands alone. */
export function SignInInfo({ showName = true }: { showName?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { profile } = useAuth();
  return (
    <View style={styles.infoCard}>
      <Ionicons name="person-circle-outline" size={28} color={c.text.secondary} />
      <View style={styles.infoText}>
        {showName && <Text style={styles.infoName}>{profile?.username ?? '—'}</Text>}
        <Text style={styles.infoHint}>
          Your library, notes and recordings are stored in your Studiply account in the cloud (Supabase, EU),
          protected by your password.
        </Text>
      </View>
    </View>
  );
}

/** What goes to an AI service, and when (the consent card comes in step 10.1). */
export function AiPrivacyNote() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.infoCard}>
      <Ionicons name="shield-checkmark-outline" size={26} color={c.text.secondary} />
      <View style={styles.infoText}>
        <Text style={styles.infoHint}>Recordings are sent to ElevenLabs, and notes and photos to Anthropic, only after you allow it.</Text>
      </View>
    </View>
  );
}

// ── Danger zone ──────────────────────────────────────────────────────────

/** "Delete data on this device" and/or "Sign out", in a red card. */
export function DangerZone({
  title = 'DANGER ZONE',
  deleteData = true,
  signOut: showSignOut = true,
}: {
  title?: string | null;
  deleteData?: boolean;
  signOut?: boolean;
}) {
  const settingsStyles = useThemedStyles(makeSettingsStyles);
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { profile, signOut } = useAuth();

  const handleDeleteAllData = () => {
    showAlert(
      'Delete data on this device',
      'This deletes what earlier versions of Studiply saved on this iPhone, then signs you out. Your library in your Studiply account stays. Deleting the account itself comes in a later update.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            showAlert(
              'Are you absolutely sure?',
              'The courses, notes and recordings that earlier versions kept on this iPhone will be gone for good.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    if (!profile?.id) return;
                    try {
                      await deleteAllUserData(profile.id);
                    } catch {
                      showAlert('Error', 'Could not delete all data. Please try again.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleSignOut = async () => {
    await confirmSignOut(signOut, { title: 'Sign out', message: 'You can sign in again with your email and password.' });
  };

  return (
    <>
      {title !== null && <Text style={[settingsStyles.sectionHeader, { color: c.error }]}>{title}</Text>}
      <View style={[settingsStyles.card, styles.dangerCard]}>
        {deleteData && (
          <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteAllData} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={18} color={c.error} />
            <Text style={styles.dangerLabel}>Delete data on this device</Text>
          </TouchableOpacity>
        )}
        {deleteData && showSignOut && <View style={settingsStyles.divider} />}
        {showSignOut && (
          <TouchableOpacity style={styles.dangerRow} onPress={handleSignOut} activeOpacity={0.75}>
            <Ionicons name="log-out-outline" size={18} color={c.error} />
            <Text style={styles.dangerLabel}>Sign out</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 14,
    },
    profileInfo: { flex: 1, gap: 2 },
    profileName: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
    },
    profileSubtitle: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
    },
    editProfileLink: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
      fontWeight: Typography.weight.medium,
    },
    editIconButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Danger zone
    dangerCard: {
      borderColor: c.status.error.border,
      backgroundColor: c.status.error.bg,
    },
    dangerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 15,
      gap: 12,
    },
    dangerLabel: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
      color: c.error,
    },

    // From Security
    infoCard: {
      flexDirection: 'row',
      gap: 14,
      alignItems: 'center',
      backgroundColor: c.surfaceMuted,
      borderRadius: 14,
      padding: 16,
    },
    infoText: { flex: 1, gap: 4 },
    infoName: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
    },
    infoHint: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
      lineHeight: 19,
      marginTop: 4,
    },

    // Edit profile sheet
    modalKAV: {
      width: '100%',
    },
    modalSheet: {
      backgroundColor: c.white,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 28,
      paddingHorizontal: 24,
      gap: 14,
    },
    modalTitle: {
      fontSize: Typography.size.xl,
      fontWeight: Typography.weight.bold,
      color: c.text.primary,
      marginBottom: 4,
    },
    modalInput: {
      backgroundColor: c.surfaceMuted,
      borderRadius: 100,
      paddingHorizontal: 20,
      paddingVertical: 14,
      fontSize: Typography.size.base,
      color: c.text.primary,
    },
    errorText: {
      fontSize: Typography.size.sm,
      color: c.error,
      marginTop: -6,
    },
    saveButton: {
      backgroundColor: c.black,
      borderRadius: 100,
      paddingVertical: 16,
      alignItems: 'center',
      minHeight: 54,
      justifyContent: 'center',
      marginTop: 4,
    },
    saveButtonText: {
      color: c.white,
      fontSize: Typography.size.md,
      fontWeight: Typography.weight.semibold,
    },
    cancelButton: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    cancelButtonText: {
      fontSize: Typography.size.base,
      color: c.text.secondary,
      fontWeight: Typography.weight.medium,
    },
    modalAvatarSection: {
      alignItems: 'center',
      paddingVertical: 4,
      gap: 12,
    },
    photoActions: {
      flexDirection: 'row',
      gap: 24,
      minHeight: 22,
    },
    photoActionText: {
      fontSize: Typography.size.sm,
      color: c.text.primary,
      fontWeight: Typography.weight.semibold,
    },
    photoRemoveText: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
      fontWeight: Typography.weight.medium,
    },
    photoStatusText: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
      minHeight: 22,
    },
  });
