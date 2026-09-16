import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { updateProfile } from '../../../src/services/profile.service';
import { getSpendingByProvider, getSpendingByOperation } from '../../../src/services/ai-usage.service';
import {
  getEstimatedBalances,
  updateBudget,
  type EstimatedBalances,
} from '../../../src/services/credit-check.service';
import { getStorageStats } from '../../../src/services/source-file.service';
import { deleteAllUserData } from '../../../src/services/auth.service';

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

  // Budget edit modal
  const [editingBudget, setEditingBudget] = useState<'openai' | 'anthropic' | null>(null);
  const [budgetText, setBudgetText] = useState('');
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  // Piggy bank data
  const [balances, setBalances] = useState<EstimatedBalances | null>(null);
  const [providerStats, setProviderStats] = useState<ProviderStats | null>(null);
  const [operationRows, setOperationRows] = useState<OperationRow[]>([]);
  const [piggyLoading, setPiggyLoading] = useState(false);

  // Storage
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  // -------------------------------------------------------------------
  // Load piggy bank data
  // -------------------------------------------------------------------
  const loadPiggyData = useCallback(async (uid: string) => {
    setPiggyLoading(true);
    try {
      const [bal, stats, ops] = await Promise.all([
        getEstimatedBalances(uid),
        getSpendingByProvider(uid),
        getSpendingByOperation(uid),
      ]);
      setBalances(bal);
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
  // Edit budget
  // -------------------------------------------------------------------
  const openBudgetEdit = (provider: 'openai' | 'anthropic') => {
    const current = provider === 'openai'
      ? (balances?.openai.deposited ?? 10)
      : (balances?.anthropic.deposited ?? 10);
    setBudgetText(String(current));
    setEditingBudget(provider);
  };

  const handleSaveBudget = async () => {
    if (!profile?.id || !editingBudget) return;
    const amount = parseFloat(budgetText);
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid amount', 'Please enter a valid dollar amount (e.g. 20).');
      return;
    }
    setIsSavingBudget(true);
    try {
      await updateBudget(profile.id, editingBudget, amount);
      // Refresh balances
      await loadPiggyData(profile.id);
      setEditingBudget(null);
    } catch {
      Alert.alert('Error', 'Could not save budget. Please try again.');
    } finally {
      setIsSavingBudget(false);
    }
  };

  const promptBudgetIOS = (provider: 'openai' | 'anthropic') => {
    const label = provider === 'openai' ? 'OpenAI' : 'Anthropic';
    const current = provider === 'openai'
      ? (balances?.openai.deposited ?? 10)
      : (balances?.anthropic.deposited ?? 10);
    Alert.prompt(
      `${label} Deposit`,
      `How much have you deposited in your ${label} account? (total, in USD)`,
      async (value) => {
        if (!value || !profile?.id) return;
        const amount = parseFloat(value);
        if (isNaN(amount) || amount < 0) return;
        try {
          await updateBudget(profile.id, provider, amount);
          await loadPiggyData(profile.id);
        } catch {
          Alert.alert('Error', 'Could not save budget.');
        }
      },
      'plain-text',
      String(current),
      'numeric',
    );
  };

  const handleTapDeposited = (provider: 'openai' | 'anthropic') => {
    if (Platform.OS === 'ios') {
      promptBudgetIOS(provider);
    } else {
      openBudgetEdit(provider);
    }
  };

  // -------------------------------------------------------------------
  // Delete all data
  // -------------------------------------------------------------------
  const handleDeleteAllData = () => {
    Alert.alert(
      'Delete All Data',
      'This will permanently delete all your projects, sessions, notes, and files. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'This action is irreversible. Every note, recording, and project will be gone forever.',
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
                      Alert.alert('Error', 'Could not delete all data. Please try again.');
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
  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'You will need to create a new account next time you open Studiply.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => signOut(),
        },
      ],
    );
  };

  const initials = profile?.initials ?? '??';
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
            <View style={styles.initialsCircle}>
              <Text style={styles.initialsText}>{initials}</Text>
            </View>

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

        {/* ── AI PIGGY BANKS ────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>AI PIGGY BANKS 🐷</Text>

        {piggyLoading ? (
          <View style={styles.piggyLoading}>
            <ActivityIndicator color={Colors.salmon} size="small" />
            <Text style={styles.piggyLoadingText}>Loading balance data…</Text>
          </View>
        ) : (
          <>
            {/* OpenAI card */}
            <PiggyBankCard
              title="OpenAI (Transcription)"
              icon="mic-outline"
              borderColor="#F59E0B"
              bgColor="#FFFBEB"
              deposited={balances?.openai.deposited ?? 10}
              used={balances?.openai.used ?? 0}
              remaining={balances?.openai.remaining ?? 10}
              status={balances?.openai.status ?? 'good'}
              subStats={
                providerStats
                  ? `${fmt(providerStats.openai.totalMinutes, 1)} min transcribed • ${providerStats.openai.callCount} call${providerStats.openai.callCount !== 1 ? 's' : ''}`
                  : undefined
              }
              billingUrl="https://platform.openai.com/settings/organization/billing"
              onTapDeposited={() => handleTapDeposited('openai')}
            />

            {/* Anthropic card */}
            <PiggyBankCard
              title="Claude (Notes)"
              icon="sparkles-outline"
              borderColor="#7B6FD4"
              bgColor="#F5F3FF"
              deposited={balances?.anthropic.deposited ?? 10}
              used={balances?.anthropic.used ?? 0}
              remaining={balances?.anthropic.remaining ?? 10}
              status={balances?.anthropic.status ?? 'good'}
              subStats={
                providerStats
                  ? `${providerStats.anthropic.callCount} operation${providerStats.anthropic.callCount !== 1 ? 's' : ''} • ${Math.round((providerStats.anthropic.totalTokensIn + providerStats.anthropic.totalTokensOut) / 1000)}K tokens`
                  : undefined
              }
              billingUrl="https://console.anthropic.com/settings/billing"
              onTapDeposited={() => handleTapDeposited('anthropic')}
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
                    <Text style={styles.breakdownTotalLabel}>Total AI spending</Text>
                    <Text style={styles.breakdownTotalCost}>${fmt(totalSpent, 4)}</Text>
                  </View>
                </View>
              </>
            )}

            {/* Cost reference */}
            <View style={styles.costRefCard}>
              <Text style={styles.costRefTitle}>Estimated costs per use</Text>
              <Text style={styles.costRefLine}>• 10 min transcription ≈ $0.06</Text>
              <Text style={styles.costRefLine}>• Standard lecture notes ≈ $0.10–0.30</Text>
              <Text style={styles.costRefLine}>• Clarification ≈ $0.03–0.10</Text>
              <Text style={styles.costRefNote}>
                Balance is estimated. Update your deposit amount when you add credits.
              </Text>
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
            <Text style={styles.dangerLabel}>Delete all my data</Text>
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

                {/* ── Initials circle ── */}
                <View style={styles.modalAvatarSection}>
                  <View style={[styles.initialsCircle, { width: 80, height: 80, borderRadius: 40 }]}>
                    <Text style={[styles.initialsText, { fontSize: 28 }]}>{initials}</Text>
                  </View>
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
                  editable={!isSaving}
                />

                {editError ? <Text style={styles.errorText}>{editError}</Text> : null}

                {/* ── Save ── */}
                <TouchableOpacity
                  style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={isSaving}
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

      {/* ── Budget edit modal (Android) ──────────────────────── */}
      <Modal
        visible={editingBudget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingBudget(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditingBudget(null)}>
          <KeyboardAvoidingView
            style={styles.modalKAV}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable>
              <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
                <Text style={styles.modalTitle}>
                  {editingBudget === 'openai' ? 'OpenAI' : 'Anthropic'} Deposit
                </Text>
                <Text style={styles.budgetModalHint}>
                  How much have you deposited in your{' '}
                  {editingBudget === 'openai' ? 'OpenAI' : 'Anthropic'} account? (total, in USD)
                </Text>

                <TextInput
                  style={styles.modalInput}
                  value={budgetText}
                  onChangeText={setBudgetText}
                  autoFocus
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveBudget}
                  placeholder="e.g. 20"
                  placeholderTextColor={Colors.text.placeholder}
                />

                <TouchableOpacity
                  style={[styles.saveButton, isSavingBudget && { opacity: 0.6 }]}
                  onPress={handleSaveBudget}
                  disabled={isSavingBudget}
                  activeOpacity={0.85}
                >
                  {isSavingBudget ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setEditingBudget(null)}
                  activeOpacity={0.7}
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
// PiggyBankCard
// -------------------------------------------------------------------
interface PiggyBankCardProps {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  borderColor: string;
  bgColor: string;
  deposited: number;
  used: number;
  remaining: number;
  status: 'good' | 'low' | 'empty';
  subStats?: string;
  billingUrl: string;
  onTapDeposited: () => void;
}

function PiggyBankCard({
  title,
  icon,
  borderColor,
  bgColor,
  deposited,
  used,
  remaining,
  status,
  subStats,
  billingUrl,
  onTapDeposited,
}: PiggyBankCardProps) {
  const pctUsed = deposited > 0 ? Math.min(used / deposited, 1) : 1;
  const pctRemaining = 1 - pctUsed;
  const barColor = progressColor(pctRemaining);

  return (
    <View style={[piggyStyles.card, { borderColor, backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={piggyStyles.header}>
        <View style={[piggyStyles.iconWrap, { borderColor }]}>
          <Ionicons name={icon} size={16} color={borderColor} />
        </View>
        <Text style={piggyStyles.title}>{title} 🐷</Text>
      </View>

      {/* Balance rows */}
      <TouchableOpacity onPress={onTapDeposited} activeOpacity={0.7}>
        <View style={piggyStyles.balanceRow}>
          <Text style={piggyStyles.balanceLabel}>Deposited</Text>
          <Text style={[piggyStyles.balanceValue, piggyStyles.depositedValue]}>
            ${deposited.toFixed(2)} <Text style={piggyStyles.tapHint}>(tap to update)</Text>
          </Text>
        </View>
      </TouchableOpacity>

      <View style={piggyStyles.balanceRow}>
        <Text style={piggyStyles.balanceLabel}>Used</Text>
        <Text style={piggyStyles.balanceValue}>${used.toFixed(4)}</Text>
      </View>

      <View style={piggyStyles.balanceRow}>
        <Text style={piggyStyles.balanceLabel}>Remaining</Text>
        <Text style={[piggyStyles.balanceValue, { color: barColor, fontWeight: Typography.weight.bold }]}>
          ~${remaining.toFixed(2)}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={piggyStyles.barTrack}>
        <View
          style={[
            piggyStyles.barFill,
            { width: `${Math.round(pctRemaining * 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={[piggyStyles.barLabel, { color: barColor }]}>
        {Math.round(pctRemaining * 100)}% remaining
      </Text>

      {/* Sub-stats */}
      {subStats ? <Text style={piggyStyles.subStats}>{subStats}</Text> : null}

      {/* Warnings */}
      {status === 'low' && (
        <View style={piggyStyles.warningAmber}>
          <Ionicons name="warning-outline" size={14} color="#B87B14" />
          <Text style={piggyStyles.warningTextAmber}>Running low! Consider adding credits.</Text>
        </View>
      )}
      {status === 'empty' && (
        <TouchableOpacity
          style={piggyStyles.warningRed}
          onPress={() => Linking.openURL(billingUrl)}
          activeOpacity={0.75}
        >
          <Ionicons name="alert-circle" size={14} color="#CC3333" />
          <Text style={piggyStyles.warningTextRed}>Empty! Add credits →</Text>
        </TouchableOpacity>
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
  depositedValue: {
    color: Colors.text.primary,
  },
  tapHint: {
    fontSize: 11,
    color: Colors.text.placeholder,
    fontWeight: Typography.weight.regular,
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
  warningAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 4,
  },
  warningTextAmber: {
    fontSize: Typography.size.xs,
    color: '#B87B14',
    fontWeight: Typography.weight.medium,
    flex: 1,
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
  initialsCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.salmon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
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
  budgetModalHint: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    marginTop: -8,
    lineHeight: 20,
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
  },
});
