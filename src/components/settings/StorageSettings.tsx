/**
 * StorageSettings.tsx
 * How many source files (recordings, photos, PDFs) the account keeps.
 * Moved unchanged from the old Manage Account screen (step 3.6).
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../hooks/useAuth';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { getStorageStats } from '../../services/source-file.service';
import { makeSettingsStyles } from './styles';

type StorageStats = {
  audioCount: number;
  photoCount: number;
  pdfCount: number;
};

/** "4 files · 2 audio, 1 photo, 1 PDF"; "No files stored". */
export function sourceFilesLine(stats: StorageStats): string {
  const total = stats.audioCount + stats.photoCount + stats.pdfCount;
  if (total === 0) return 'No files stored';
  return `${total} file${total !== 1 ? 's' : ''} · ${stats.audioCount} audio, ${stats.photoCount} photo${stats.photoCount !== 1 ? 's' : ''}, ${stats.pdfCount} PDF${stats.pdfCount !== 1 ? 's' : ''}`;
}

export function SourceFilesCard({ title = 'YOUR DATA' }: { title?: string | null }) {
  const settingsStyles = useThemedStyles(makeSettingsStyles);
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { profile } = useAuth();
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    const uid = profile.id;
    (async () => {
      try {
        setStorageStats(await getStorageStats(uid));
      } catch {
        // non-fatal
      }
    })();
  }, [profile?.id]);

  return (
    <>
      {title !== null && <Text style={settingsStyles.sectionHeader}>{title}</Text>}
      <View style={settingsStyles.card}>
        <View style={styles.dataRow}>
          <View style={styles.dataRowIcon}>
            <Ionicons name="folder-outline" size={18} color={c.text.secondary} />
          </View>
          <View style={styles.dataRowText}>
            <Text style={styles.dataRowLabel}>Source files</Text>
            {storageStats ? <Text style={styles.dataRowSub}>{sourceFilesLine(storageStats)}</Text> : null}
          </View>
        </View>
      </View>
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
      backgroundColor: c.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dataRowText: { flex: 1 },
    dataRowLabel: {
      flex: 1,
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
      color: c.text.primary,
    },
    dataRowSub: {
      fontSize: Typography.size.xs,
      color: c.text.secondary,
      marginTop: 1,
    },
  });
