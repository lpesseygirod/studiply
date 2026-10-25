import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** New folder · Upload · Take photo (iPhone) · Record, above the course grid. */
export function LibraryToolbar({
  onNewFolder,
  onUpload,
  onTakePhoto,
  onRecord,
  uploadProgress,
}: {
  onNewFolder: () => void;
  onUpload: () => void;
  onTakePhoto: () => void;
  onRecord: () => void;
  /** While files upload: "2 of 5". */
  uploadProgress: { done: number; total: number } | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const button = (icon: IconName, label: string, onPress: () => void, extra?: object, busy?: boolean) => (
    <Pressable
      key={label}
      style={({ pressed }) => [styles.button, extra, pressed && styles.pressed]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? <ActivityIndicator size="small" color={c.text.secondary} /> : <Ionicons name={icon} size={16} color={c.text.primary} />}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {button('folder-open-outline', 'New folder', onNewFolder)}
      {button(
        'cloud-upload-outline',
        uploadProgress ? `Uploading ${Math.min(uploadProgress.done + 1, uploadProgress.total)} of ${uploadProgress.total}` : 'Upload',
        onUpload,
        undefined,
        !!uploadProgress,
      )}
      {Platform.OS !== 'web' && button('camera-outline', 'Take photo', onTakePhoto)}
      <Pressable
        style={({ pressed }) => [styles.button, styles.record, pressed && styles.pressed]}
        onPress={onRecord}
        accessibilityRole="button"
        accessibilityLabel="Record lecture here"
      >
        <View style={styles.recordDot} />
        <Text style={styles.recordLabel}>Record</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 100,
      backgroundColor: c.card,
    },
    pressed: { opacity: 0.7 },
    label: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.primary },
    record: { backgroundColor: c.recording },
    recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.onRecording },
    recordLabel: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.onRecording },
  });
