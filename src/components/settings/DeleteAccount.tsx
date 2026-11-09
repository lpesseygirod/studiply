import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { useConnectivity } from '../../lib/connectivity';
import { syncCounts, syncEnabled } from '../../lib/sync';
import { confirmsDeletion, CONFIRM_WORD, deleteAccount } from '../../services/account.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { errorMessage } from '../../utils/errors';
import { showAlert } from '../dialogs/dialogs';

const OFFLINE_HINT = 'Deleting your account needs a connection';

/**
 * Delete account… (step 10.1; App Review 5.1.1(v)): the Account page's red card (`row`, both devices)
 * and the iPhone's Settings list under Sign out (`link`, iphone-07). It opens one page: what goes (on
 * every device, can't be undone; this iPhone's changes not synced yet too), a field where she types
 * DELETE (works for Apple accounts, which have no password), Cancel and Delete account (red, greyed
 * until the word matches). Online only. Afterwards she is signed out on this device.
 */
export function DeleteAccountButton({ variant }: { variant: 'row' | 'link' }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const offline = useConnectivity() === 'offline';
  const [open, setOpen] = useState(false);
  const label = 'Delete account…';
  const press = () => (offline ? showAlert('Delete account', `${OFFLINE_HINT}.`) : setOpen(true));
  return (
    <>
      {variant === 'row' ? (
        <TouchableOpacity
          style={[styles.row, offline && styles.dim]}
          onPress={press}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityHint={offline ? OFFLINE_HINT : undefined}
          {...{ dataSet: { account: 'delete' } }}
        >
          <Ionicons name="person-remove-outline" size={18} color={c.error} />
          <Text style={styles.rowText}>{label}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.link, offline && styles.dim]}
          onPress={press}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityHint={offline ? OFFLINE_HINT : undefined}
          {...{ dataSet: { account: 'delete' } }}
        >
          <Text style={styles.linkText}>{label}</Text>
        </TouchableOpacity>
      )}
      {open && <DeleteAccountSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { signOut } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsynced, setUnsynced] = useState(0);
  useEffect(() => {
    if (!syncEnabled) return;
    syncCounts()
      .then((n) => setUnsynced(n.pending + n.failed))
      .catch(() => {});
  }, []);
  const ready = confirmsDeletion(typed) && !busy;

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      onClose();
      // This device: signed out and its copy wiped (AuthProvider), then the welcome screen.
      await signOut().catch(() => {});
      showAlert('Your account was deleted', 'Everything you had in Studiply is gone, on every device.');
    } catch (err) {
      setError(errorMessage(err, 'Your account couldn’t be deleted. Please try again.'));
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
      <Pressable style={styles.overlay} onPress={() => !busy && onClose()}>
        <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal {...{ dataSet: { account: 'delete-sheet' } }}>
          <ScrollView contentContainerStyle={styles.cardBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.title} accessibilityRole="header">
              Delete your account?
            </Text>
            <Text style={styles.text}>
              This deletes everything you have in Studiply, on every device: every course, lecture, recording, transcript, note, summary,
              document, photo, PDF, flashcard and quiz, and your account itself. It can’t be undone.
            </Text>
            {unsynced > 0 && (
              <Text style={styles.text} {...{ dataSet: { account: 'unsynced' } }}>
                {unsynced === 1 ? '1 change' : `${unsynced} changes`} on this iPhone haven’t synced yet: they’re deleted too.
              </Text>
            )}
            <Text style={styles.label}>Type {CONFIRM_WORD} to confirm</Text>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              editable={!busy}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={CONFIRM_WORD}
              placeholderTextColor={c.text.placeholder}
              style={styles.input}
              onSubmitEditing={() => void run()}
              accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
              {...{ dataSet: { account: 'confirm-field' } }}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.buttons}>
              <Pressable onPress={onClose} disabled={busy} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { account: 'cancel' } }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void run()}
                disabled={!ready}
                style={({ pressed }) => [styles.delete, !ready && styles.deleteOff, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready }}
                {...{ dataSet: { account: 'confirm-delete' } }}
              >
                {busy ? <ActivityIndicator size="small" color={c.white} /> : <Text style={styles.deleteText}>Delete account</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
    rowText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.error },
    link: { alignItems: 'center', paddingVertical: 14 },
    linkText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.error },
    dim: { opacity: 0.5 },
    overlay: { flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', padding: Platform.OS === 'web' ? 24 : 0 },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '90%',
      backgroundColor: c.card,
      borderRadius: 20,
      ...(Platform.OS === 'web' ? {} : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }),
    },
    cardBody: { padding: 24, gap: 14 },
    title: { fontSize: Typography.size.xl, fontWeight: Typography.weight.bold, color: c.text.primary },
    text: { fontSize: Typography.size.base, color: c.text.primary, lineHeight: 22 },
    label: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.secondary },
    input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, fontSize: Typography.size.base, color: c.text.primary },
    error: { fontSize: Typography.size.sm, color: c.error },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: 4 },
    cancel: { height: 44, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
    cancelText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    delete: { height: 44, minWidth: 140, paddingHorizontal: 18, borderRadius: 10, backgroundColor: c.error, alignItems: 'center', justifyContent: 'center' },
    deleteOff: { opacity: 0.4 },
    deleteText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.white },
    pressed: { opacity: 0.75 },
  });
