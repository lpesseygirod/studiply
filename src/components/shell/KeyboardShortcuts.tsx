import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { isEditable, SHORTCUTS, shortcutFor } from '../../lib/shortcuts';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { isDialogOpen, showAlert } from '../dialogs/dialogs';
import { IconButton } from '../IconButton';
import { recordHref, registerShellCommand, runShellCommand, useShell } from './ShellContext';

/**
 * The web app's keyboard shortcuts (src/lib/shortcuts.ts) and the sheet
 * that lists them ("?", or Settings → General → Keyboard shortcuts).
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const { location } = useShell();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => registerShellCommand('showShortcuts', () => setSheetOpen(true)), []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (sheetOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setSheetOpen(false);
        }
        return;
      }
      const action = shortcutFor({
        code: e.code,
        key: e.key,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        targetIsEditable: isEditable(document.activeElement),
        dialogOpen: isDialogOpen(),
      });
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case 'record':
          router.navigate(recordHref(location));
          break;
        case 'newFolder':
          if (!runShellCommand('newFolder')) showAlert('New folder', 'Open a course to make a folder in it.');
          break;
        case 'newDocument':
          showAlert('New document', 'New documents come with the editor. Coming soon.');
          break;
        case 'focusSearch':
          if (!runShellCommand('focusSearch')) router.navigate('/search');
          break;
        case 'showShortcuts':
          setSheetOpen(true);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, location, sheetOpen]);

  return <ShortcutsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />;
}

function ShortcutsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close keyboard shortcuts">
        <Pressable style={styles.sheet} onPress={() => {}} testID="shortcuts-sheet" accessibilityRole="none">
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Keyboard shortcuts
            </Text>
            <IconButton icon="close" label="Close" onPress={onClose} color={c.text.secondary} />
          </View>
          {SHORTCUTS.map((s) => (
            <View key={s.keys} style={styles.row}>
              <Text style={styles.keys}>{s.keys}</Text>
              <Text style={styles.action}>
                {s.action}
                {s.soon && <Text style={styles.soon}> · coming soon</Text>}
              </Text>
            </View>
          ))}
          <Text style={styles.note}>Shortcuts don&apos;t work while you type in a field.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 16 },
    sheet: { width: '100%', maxWidth: 440, backgroundColor: c.card, borderRadius: 16, padding: 20, gap: 4 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    title: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 36 },
    keys: {
      minWidth: 70,
      textAlign: 'center',
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
      backgroundColor: c.cardMuted,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 6,
      paddingVertical: 3,
      paddingHorizontal: 8,
      overflow: 'hidden',
    },
    action: { flex: 1, fontSize: Typography.size.base, color: c.text.primary },
    soon: { color: c.text.secondary },
    note: { marginTop: 10, fontSize: Typography.size.sm, color: c.text.secondary },
  });
