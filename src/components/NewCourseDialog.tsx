import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Colors, type ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { a11yState } from '../utils/a11y';
import { createProject, type ProjectWithCount } from '../services/project.service';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { errorMessage } from '../utils/errors';
import type { Anchor } from './dialogs/dialogs';

const COLOR_NAMES = ['Salmon', 'Lavender', 'Mint', 'Sky blue', 'Yellow', 'Grey'];
const WIDTH = 340;

/**
 * New course (step 3.2, Lea): a small dialog, not a full-width sheet. On
 * the laptop it opens next to the button that asked for it (`anchor`), on
 * the iPhone in the middle of the screen. Name, colour, Create / Cancel;
 * Enter creates, Esc or a click outside cancels.
 */
export function NewCourseDialog({
  visible,
  userId,
  anchor,
  onClose,
  onCreated,
  onDismiss,
}: {
  visible: boolean;
  userId: string;
  anchor?: Anchor;
  onClose: () => void;
  onCreated: (course: ProjectWithCount) => void;
  /** Once it has finished closing (focus is back where it was on the web); see MoveToModal's. */
  onDismiss?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const window = useWindowDimensions();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(Colors.courseColors[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName('');
    setColor(Colors.courseColors[0]);
    setError('');
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const create = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const course = await createProject(userId, name, color);
      onCreated({ ...course, sessionCount: 0, itemCount: 0 });
    } catch (err) {
      setError(errorMessage(err, err instanceof Error ? err.message : 'Could not create the course.'));
    } finally {
      setSaving(false);
    }
  };

  const width = Math.min(WIDTH, window.width - 32);
  const placed =
    anchor && Platform.OS === 'web'
      ? {
          position: 'absolute' as const,
          left: Math.max(16, Math.min(anchor.x, window.width - width - 16)),
          top: Math.max(16, Math.min(anchor.y, window.height - 320)),
        }
      : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={onDismiss}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[styles.overlay, !placed && styles.centered]} onPress={onClose} accessibilityLabel="Close">
          <Pressable style={[styles.card, { width }, placed]} onPress={() => {}} testID="new-course-dialog" accessibilityRole="none">
            <Text style={styles.title} accessibilityRole="header">
              New course
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Course name"
              placeholderTextColor={c.text.placeholder}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={create}
              accessibilityLabel="Course name"
            />
            <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Colour">
              {Colors.courseColors.map((value, i) => (
                <Pressable
                  key={value}
                  onPress={() => setColor(value)}
                  style={[styles.swatchTarget]}
                  accessibilityRole="radio"
                  {...a11yState({ checked: color === value })}
                  accessibilityLabel={COLOR_NAMES[i] ?? `Colour ${i + 1}`}
                  testID={`course-color-${i}`}
                >
                  <View style={[styles.swatch, { backgroundColor: value }, color === value && styles.swatchSelected]} />
                </Pressable>
              ))}
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.buttons}>
              <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.create, (!name.trim() || saving) && styles.disabled]}
                onPress={create}
                disabled={!name.trim() || saving}
                accessibilityRole="button"
              >
                {saving ? <ActivityIndicator color={c.button.primaryText} size="small" /> : <Text style={styles.createText}>Create</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    overlay: { flex: 1, backgroundColor: c.overlay },
    centered: { alignItems: 'center', justifyContent: 'center' },
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 18,
      gap: 14,
      shadowColor: c.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    },
    title: { fontSize: Typography.size.md, fontWeight: Typography.weight.bold, color: c.text.primary },
    input: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.cardMuted,
      fontSize: Typography.size.base,
      color: c.text.primary,
    },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    swatchTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    swatch: { width: 30, height: 30, borderRadius: 15 },
    swatchSelected: { borderWidth: 3, borderColor: c.accentDark },
    error: { fontSize: Typography.size.sm, color: c.status.error.text },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    cancel: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
    cancelText: { fontSize: Typography.size.base, color: c.text.secondary, fontWeight: Typography.weight.medium },
    create: {
      minHeight: 40,
      minWidth: 88,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.button.primary,
    },
    createText: { fontSize: Typography.size.base, color: c.button.primaryText, fontWeight: Typography.weight.semibold },
    disabled: { opacity: 0.45 },
  });
