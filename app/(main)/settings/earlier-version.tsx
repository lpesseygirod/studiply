import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { GradientFill } from '../../../src/components/GradientBackground';
import { IconButton } from '../../../src/components/IconButton';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { showAlert } from '../../../src/components/dialogs/dialogs';
import { confirmAction } from '../../../src/utils/confirm';
import { errorMessage } from '../../../src/utils/errors';
import {
  ImportBlockedError,
  loadEarlierVersion,
  removeEarlierVersion,
  uploadEarlierVersion,
  type EarlierVersion,
  type ImportProgress,
  type ImportRecord,
  type ProfileSummary,
} from '../../../src/services/legacyImport';
import { describeError } from '../../../src/lib/sync/queue';

// Step 1.9: the data the earlier version of Studiply left on this iPhone.
// The student sees each old profile with its counts and first names, ticks
// the ones to upload (nothing is ticked by default), follows the upload, and
// once everything is checked on Studiply can remove the old copy.

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function countsLine(p: ProfileSummary): string {
  return [
    plural(p.courses, 'course', 'courses'),
    plural(p.folders, 'folder', 'folders'),
    plural(p.lectures, 'lecture', 'lectures'),
    plural(p.notes, 'note', 'notes'),
    plural(p.transcripts, 'transcript', 'transcripts'),
    plural(p.recordings, 'recording', 'recordings'),
    plural(p.photos + p.pdfs, 'photo/PDF', 'photos/PDFs'),
  ].join(' · ');
}

function missingLine(record: ImportRecord): string | null {
  if (record.missing.length === 0) return null;
  const by = (kind: string) => record.missing.filter((m) => m.kind === kind).length;
  const parts = [
    by('recording') && plural(by('recording'), 'recording', 'recordings'),
    by('photo') && plural(by('photo'), 'photo', 'photos'),
    by('pdf') && plural(by('pdf'), 'PDF', 'PDFs'),
  ].filter(Boolean);
  return `Not found on this iPhone (not uploaded): ${parts.join(', ')}.`;
}

export default function EarlierVersionScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.id ?? '';

  const [data, setData] = useState<EarlierVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const next = await loadEarlierVersion(uid);
      setData(next);
      if (next?.record) setChosen(new Set(next.record.profileIds));
    } catch (err) {
      setError(errorMessage(err, 'Could not read the earlier version data.'));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const upload = async () => {
    if (!data || chosen.size === 0) return;
    setError('');
    setProgress({ done: 0, total: 1, step: 'Starting' });
    try {
      await uploadEarlierVersion({ data, uid, profileIds: [...chosen], onProgress: setProgress });
    } catch (err) {
      // The reason with the server's status and message; Retry continues.
      setError(err instanceof ImportBlockedError ? err.message : `The upload stopped: ${describeError(err)}`);
    } finally {
      setProgress(null);
      await load();
    }
  };

  const removeCopy = async () => {
    if (!data) return;
    const ok = await confirmAction(
      'Remove the old copy?',
      data.source.sample
        ? 'This removes the development sample from this iPhone. What was uploaded stays in Studiply.'
        : 'This removes the earlier version’s database and files from this iPhone. Everything uploaded stays in your Studiply account.',
      'Remove',
    );
    if (!ok) return;
    try {
      await removeEarlierVersion(data);
      await load();
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not remove the old copy.'));
    }
  };

  const record = data?.record ?? null;
  const verified = record?.status === 'verified';
  const busy = progress !== null;

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} size={24} color={c.text.onGradientStrong} style={styles.iconButton} />
        <Text style={styles.headerTitle}>Earlier version data</Text>
        <View style={styles.iconButton} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.salmon} />
        </View>
      ) : !data ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={44} color={c.text.placeholder} />
          <Text style={styles.emptyTitle}>Nothing from the earlier version on this iPhone</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          {data.source.sample && (
            <View style={styles.sampleBadge}>
              <Ionicons name="flask-outline" size={14} color={c.text.secondary} />
              <Text style={styles.sampleText}>Development sample data (not your real earlier-version data)</Text>
            </View>
          )}

          <Text style={styles.intro}>
            The earlier version of Studiply kept your library on this iPhone. Choose which profile to upload to your
            Studiply account. Nothing is deleted from the iPhone until you remove the old copy yourself.
          </Text>

          {data.uploadedElsewhere && !record && (
            <Text style={styles.warning}>This data was already uploaded to another account on this server.</Text>
          )}

          {data.profiles.map((p) => {
            const on = chosen.has(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.profileCard, on && styles.profileCardOn]}
                onPress={() => toggle(p.id)}
                disabled={busy || verified}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                activeOpacity={0.8}
              >
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? c.salmon : c.text.secondary} />
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{p.name}</Text>
                  <Text style={styles.profileMeta}>Created {new Date(p.createdAt).toLocaleDateString()}</Text>
                  <Text style={styles.profileCounts}>{countsLine(p)}</Text>
                  {p.courseNames.length > 0 && (
                    <Text style={styles.profileNames} numberOfLines={2}>Courses: {p.courseNames.join(', ')}</Text>
                  )}
                  {p.lectureTitles.length > 0 && (
                    <Text style={styles.profileNames} numberOfLines={2}>Lectures: {p.lectureTitles.join(', ')}</Text>
                  )}
                  {p.oldTrash > 0 && (
                    <Text style={styles.profileMeta}>
                      {plural(p.oldTrash, 'item', 'items')} deleted more than 30 days ago won’t be uploaded.
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {progress && (
            <View style={styles.progressBox}>
              <Text style={styles.progressText}>
                Uploading… {progress.step} ({progress.done}/{progress.total})
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }]} />
              </View>
            </View>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          {record && !busy && (
            <View style={[styles.resultBox, verified ? styles.resultOk : styles.resultPartial]}>
              <Text style={styles.resultTitle}>
                {verified ? 'All uploaded and checked on Studiply' : 'Not everything is on Studiply yet'}
              </Text>
              {!!missingLine(record) && <Text style={styles.resultText}>{missingLine(record)}</Text>}
              {verified && record.verifiedAt && (
                <Text style={styles.resultText}>Checked {new Date(record.verifiedAt).toLocaleString()}.</Text>
              )}
            </View>
          )}

          {!verified && (
            <TouchableOpacity
              style={[styles.primaryButton, (chosen.size === 0 || busy) && styles.buttonDisabled]}
              onPress={upload}
              disabled={chosen.size === 0 || busy}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryText, (chosen.size === 0 || busy) && styles.buttonTextDisabled]}>
                {chosen.size === 0 ? 'Tick a profile to upload' : record ? 'Retry upload' : 'Upload'}
              </Text>
            </TouchableOpacity>
          )}

          {verified && (
            <TouchableOpacity style={styles.removeButton} onPress={removeCopy} activeOpacity={0.85}>
              <Text style={styles.removeText}>Remove the old copy from this iPhone</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.surfaceMuted,
  },
  iconButton: { width: 60, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: Typography.size.md, fontWeight: Typography.weight.bold, color: c.text.onGradientStrong },
  emptyTitle: { fontSize: Typography.size.base, color: c.text.onGradient, textAlign: 'center' },
  content: { padding: 16, gap: 12 },
  sampleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: c.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sampleText: { fontSize: Typography.size.xs, color: c.text.secondary },
  intro: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: Typography.size.sm * Typography.leading.relaxed },
  warning: { fontSize: Typography.size.sm, color: c.error },
  profileCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: c.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.surfaceMuted,
    padding: 14,
  },
  profileCardOn: { borderColor: c.salmon, backgroundColor: c.salmonLight },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
  profileMeta: { fontSize: Typography.size.xs, color: c.text.secondary },
  profileCounts: { fontSize: Typography.size.sm, color: c.text.primary },
  profileNames: { fontSize: Typography.size.xs, color: c.text.secondary },
  progressBox: { gap: 6 },
  progressText: { fontSize: Typography.size.sm, color: c.text.primary },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: c.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: c.salmon },
  error: { fontSize: Typography.size.sm, color: c.error },
  resultBox: { borderRadius: 12, padding: 14, gap: 4 },
  resultOk: { backgroundColor: c.accentLight },
  resultPartial: { backgroundColor: c.errorLight },
  resultTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
  resultText: { fontSize: Typography.size.sm, color: c.text.secondary },
  primaryButton: {
    backgroundColor: c.button.primary,
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { backgroundColor: c.surfaceMuted },
  primaryText: { color: c.button.primaryText, fontSize: Typography.size.base, fontWeight: Typography.weight.semibold },
  buttonTextDisabled: { color: c.text.secondary },
  removeButton: {
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.error,
    marginTop: 4,
  },
  removeText: { color: c.error, fontSize: Typography.size.base, fontWeight: Typography.weight.semibold },
});
