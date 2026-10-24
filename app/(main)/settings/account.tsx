import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '../../../src/hooks/useAuth';
import { confirmAction } from '../../../src/utils/confirm';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import UserAvatar from '../../../src/components/UserAvatar';
import {
  removeProfilePhoto,
  setProfilePhoto,
  updateProfile,
} from '../../../src/services/profile.service';
import { getSpendingByProvider, getSpendingByOperation } from '../../../src/services/ai-usage.service';
import {
  formatClaude,
  formatTranscription,
  getTodayUsage,
  type TodayUsage,
} from '../../../src/services/credit-check.service';
import { getStorageStats } from '../../../src/services/source-file.service';
import { deleteAllUserData } from '../../../src/services/auth.service';
import { showAlert } from '../../../src/components/dialogs/dialogs';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

type StorageStats = {
  audioCount: number;
  photoCount: number;
  pdfCount: number;
};

type ProviderStats = {
  openai: { totalCost: number; totalMinutes: number; callCount: number };
  anthropic: { totalCost: number; totalTokensIn: number; totalTokensOut: number; callCount: number };
};

type OperationRow = { operation: string; count: number; totalCost: number; label: string };

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function progressColor(pct: number): string {
  if (pct > 0.5) return '#2D8A5A'; // green
  if (pct > 0.2) return '#B87B14'; // amber
  return '#CC3333'; // red
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, refreshProfile, signOut } = useAuth();

  // Edit profile modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);

  // AI usage: today against the daily limits, and all-time spending
  const [today, setToday] = useState<TodayUsage | null>(null);
  const [providerStats, setProviderStats] = useState<ProviderStats | null>(null);
  const [operationRows, setOperationRows] = useState<OperationRow[]>([]);
  const [piggyLoading, setPiggyLoading] = useState(false);

  // Storage
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  // -------------------------------------------------------------------
  // Load AI usage
  // -------------------------------------------------------------------
  const loadPiggyData = useCallback(async (uid: string) => {
    setPiggyLoading(true);
    try {
      const [usage, stats, ops] = await Promise.all([
        getTodayUsage(),
        getSpendingByProvider(uid),
        getSpendingByOperation(uid),
      ]);
      setToday(usage);
      setProviderStats(stats);
      setOperationRows(ops);
    } catch {
      // non-fatal
    } finally {
      setPiggyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const uid = profile.id;

    // Storage stats
    (async () => {
      try {
        setStorageStats(await getStorageStats(uid));
      } catch {
        // non-fatal
      }
    })();

    loadPiggyData(uid);
  }, [profile?.id, loadPiggyData]);

  // -------------------------------------------------------------------
  // Edit profile — combined name + photo modal
  // -------------------------------------------------------------------
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

  // -------------------------------------------------------------------
  // Profile photo — uploads right after picking, separate from Save
  // -------------------------------------------------------------------
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

  // -------------------------------------------------------------------
  // Delete all data
  // -------------------------------------------------------------------
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
              'The projects, notes and recordings that earlier versions kept on this iPhone will be gone for good.',
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

  // -------------------------------------------------------------------
  // Sign out
  // -------------------------------------------------------------------
  const handleSignOut = async () => {
    if (
      await confirmAction(
        'Sign out',
        'You can sign in again with your email and password.',
        'Sign out',
      )
    ) {
      await signOut();
    }
  };

  const username = profile?.username ?? '—';
  const totalFiles =
    (storageStats?.audioCount ?? 0) +
    (storageStats?.photoCount ?? 0) +
    (storageStats?.pdfCount ?? 0);

  const totalSpent =
    (providerStats?.openai.totalCost ?? 0) + (providerStats?.anthropic.totalCost ?? 0);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Account</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── PROFILE ──────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>PROFILE</Text>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <UserAvatar size={52} />

            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{username}</Text>
              <TouchableOpacity onPress={openEditModal} activeOpacity={0.7}>
                <Text style={styles.editProfileLink}>Edit profile</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.editIconButton} onPress={openEditModal} activeOpacity={0.75}>
              <Ionicons name="pencil-outline" size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── AI USAGE ──────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>AI USAGE TODAY</Text>

        {piggyLoading ? (
          <View style={styles.piggyLoading}>
            <ActivityIndicator color={Colors.salmon} size="small" />
            <Text style={styles.piggyLoadingText}>Loading usage…</Text>
          </View>
        ) : (
          <>
            {today?.simulated && (
              <Text style={styles.costRefNote}>Simulated AI (development): nothing is sent or counted.</Text>
            )}

            <UsageCard
              title="Transcription"
              icon="mic-outline"
              borderColor="#F59E0B"
              bgColor="#FFFBEB"
              usedLabel={today ? formatTranscription(today) : '—'}
              fraction={today ? today.transcriptionSeconds / today.transcriptionLimitSeconds : 0}
              reached={today?.transcriptionReached ?? false}
              subStats={
                providerStats
                  ? `All time: ${fmt(providerStats.openai.totalMinutes, 1)} min transcribed • ${providerStats.openai.callCount} part${providerStats.openai.callCount !== 1 ? 's' : ''}`
                  : undefined
              }
            />

            <UsageCard
              title="Notes & assistant (Claude)"
              icon="sparkles-outline"
              borderColor="#7B6FD4"
              bgColor="#F5F3FF"
              usedLabel={today ? formatClaude(today) : '—'}
              fraction={today ? today.claudeUsd / today.claudeLimitUsd : 0}
              reached={today?.claudeReached ?? false}
              subStats={
                providerStats
                  ? `All time: ${providerStats.anthropic.callCount} request${providerStats.anthropic.callCount !== 1 ? 's' : ''} • ${Math.round((providerStats.anthropic.totalTokensIn + providerStats.anthropic.totalTokensOut) / 1000)}K tokens`
                  : undefined
              }
            />

            {/* Cost breakdown */}
            {operationRows.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { marginTop: 4 }]}>COST BREAKDOWN</Text>
                <View style={styles.card}>
                  {operationRows.map((row, i) => (
                    <React.Fragment key={row.operation}>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>{row.label}</Text>
                        <View style={styles.breakdownRight}>
                          <Text style={styles.breakdownCost}>${fmt(row.totalCost, 4)}</Text>
                          <Text style={styles.breakdownCount}>{row.count} call{row.count !== 1 ? 's' : ''}</Text>
                        </View>
                      </View>
                      {i < operationRows.length - 1 && <View style={styles.divider} />}
                    </React.Fragment>
                  ))}
                  <View style={styles.divider} />
                  <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                    <Text style={styles.breakdownTotalLabel}>Total AI cost (all time)</Text>
                    <Text style={styles.breakdownTotalCost}>${fmt(totalSpent, 4)}</Text>
                  </View>
                </View>
              </>
            )}

            {/* Cost reference */}
            <View style={styles.costRefCard}>
              <Text style={styles.costRefTitle}>About these limits</Text>
              <Text style={styles.costRefLine}>• Studiply runs the AI for you; no OpenAI or Anthropic account needed</Text>
              <Text style={styles.costRefLine}>• Each limit counts the last 24 hours, so it frees up gradually</Text>
              <Text style={styles.costRefLine}>• 10 min transcription ≈ $0.06 · lecture notes ≈ $0.02–0.30</Text>
            </View>
          </>
        )}

        {/* ── YOUR DATA ─────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>YOUR DATA</Text>
        <View style={styles.card}>
          <View style={styles.dataRow}>
            <View style={styles.dataRowIcon}>
              <Ionicons name="folder-outline" size={18} color={Colors.text.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dataRowLabel}>Source files</Text>
              {storageStats ? (
                <Text style={styles.dataRowSub}>
                  {totalFiles === 0
                    ? 'No files stored'
                    : `${totalFiles} file${totalFiles !== 1 ? 's' : ''} · ${storageStats.audioCount} audio, ${storageStats.photoCount} photo${storageStats.photoCount !== 1 ? 's' : ''}, ${storageStats.pdfCount} PDF${storageStats.pdfCount !== 1 ? 's' : ''}`}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── DANGER ZONE ───────────────────────────────────────── */}
        <Text style={[styles.sectionHeader, { color: Colors.error }]}>DANGER ZONE</Text>
        <View style={[styles.card, styles.dangerCard]}>
          <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteAllData} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
            <Text style={styles.dangerLabel}>Delete data on this device</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.dangerRow} onPress={handleSignOut} activeOpacity={0.75}>
            <Ionicons name="log-out-outline" size={18} color={Colors.error} />
            <Text style={styles.dangerLabel}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Edit profile modal (combined photo + name) ───────── */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={closeEditModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeEditModal}>
          <KeyboardAvoidingView
            style={styles.modalKAV}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable>
              <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
                <Text style={styles.modalTitle}>Edit Profile</Text>

                {/* ── Photo ── */}
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
                        <Text style={styles.photoActionText}>
                          {profile?.avatar_path ? 'Change photo' : 'Add photo'}
                        </Text>
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

                {/* ── Name input ── */}
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
                  placeholderTextColor={Colors.text.placeholder}
                  editable={!isBusy}
                />

                {editError ? <Text style={styles.errorText}>{editError}</Text> : null}

                {/* ── Save ── */}
                <TouchableOpacity
                  style={[styles.saveButton, isBusy && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={isBusy}
                  activeOpacity={0.85}
                >
                  {isSaving ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={closeEditModal}
                  activeOpacity={0.7}
                  disabled={isSaving}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

    </View>
  );
}

// -------------------------------------------------------------------
// UsageCard — today's use of one daily limit
// -------------------------------------------------------------------
interface UsageCardProps {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  borderColor: string;
  bgColor: string;
  /** e.g. "12 min of 6 h" */
  usedLabel: string;
  /** Share of the limit used, 0–1. */
  fraction: number;
  reached: boolean;
  subStats?: string;
}

function UsageCard({ title, icon, borderColor, bgColor, usedLabel, fraction, reached, subStats }: UsageCardProps) {
  const pctLeft = Math.max(0, 1 - Math.min(fraction, 1));
  const barColor = progressColor(pctLeft);

  return (
    <View style={[piggyStyles.card, { borderColor, backgroundColor: bgColor }]}>
      <View style={piggyStyles.header}>
        <View style={[piggyStyles.iconWrap, { borderColor }]}>
          <Ionicons name={icon} size={16} color={borderColor} />
        </View>
        <Text style={piggyStyles.title}>{title}</Text>
      </View>

      <View style={piggyStyles.balanceRow}>
        <Text style={piggyStyles.balanceLabel}>Used today</Text>
        <Text style={[piggyStyles.balanceValue, { color: barColor, fontWeight: Typography.weight.bold }]}>{usedLabel}</Text>
      </View>

      <View style={piggyStyles.barTrack}>
        <View style={[piggyStyles.barFill, { width: `${Math.round(Math.min(fraction, 1) * 100)}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[piggyStyles.barLabel, { color: barColor }]}>{Math.round(pctLeft * 100)}% left today</Text>

      {subStats ? <Text style={piggyStyles.subStats}>{subStats}</Text> : null}

      {reached && (
        <View style={piggyStyles.warningRed}>
          <Ionicons name="alert-circle" size={14} color="#CC3333" />
          <Text style={piggyStyles.warningTextRed}>Daily limit reached. It frees up over the next 24 hours.</Text>
        </View>
      )}
    </View>
  );
}

const piggyStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 8,
    marginBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  title: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    flex: 1,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
  },
  balanceValue: {
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
    fontWeight: Typography.weight.medium,
  },
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 11,
    fontWeight: Typography.weight.medium,
    marginTop: -2,
  },
  subStats: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  warningRed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 4,
  },
  warningTextRed: {
    fontSize: Typography.size.xs,
    color: '#CC3333',
    fontWeight: Typography.weight.medium,
  },
});

// -------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },

  sectionHeader: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wider,
    marginBottom: -4,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    overflow: 'hidden',
  },

  // Profile row
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
    color: Colors.text.primary,
  },
  editProfileLink: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
  editIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  divider: {
    height: 1,
    backgroundColor: Colors.surfaceMuted,
    marginLeft: 16,
  },

  // Data rows
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  dataRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataRowLabel: {
    flex: 1,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },
  dataRowSub: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    marginTop: 1,
  },

  // Piggy loading
  piggyLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  piggyLoadingText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
  },

  // Cost breakdown
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  breakdownLabel: {
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
    fontWeight: Typography.weight.medium,
    flex: 1,
  },
  breakdownRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  breakdownCost: {
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
    fontWeight: Typography.weight.semibold,
  },
  breakdownCount: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  breakdownTotal: {
    paddingTop: 14,
    paddingBottom: 14,
  },
  breakdownTotalLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    flex: 1,
  },
  breakdownTotalCost: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },

  // Cost reference
  costRefCard: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 12,
    padding: 14,
    gap: 5,
  },
  costRefTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    marginBottom: 2,
    letterSpacing: Typography.tracking.wide,
  },
  costRefLine: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  costRefNote: {
    fontSize: 11,
    color: Colors.text.placeholder,
    marginTop: 6,
    lineHeight: 16,
    fontStyle: 'italic',
  },

  // Danger zone
  dangerCard: {
    borderColor: '#FFCCCC',
    backgroundColor: '#FFFAFA',
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
    color: Colors.error,
  },

  // Edit modal (shared by profile & budget)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalKAV: {
    width: '100%',
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 28,
    paddingHorizontal: 24,
    gap: 14,
  },
  modalTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: Typography.size.base,
    color: Colors.text.primary,
  },
  errorText: {
    fontSize: Typography.size.sm,
    color: Colors.error,
    marginTop: -6,
  },
  saveButton: {
    backgroundColor: Colors.black,
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
    marginTop: 4,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },

  // Edit-profile modal avatar
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
    color: Colors.text.primary,
    fontWeight: Typography.weight.semibold,
  },
  photoRemoveText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
  photoStatusText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    minHeight: 22,
  },
});
