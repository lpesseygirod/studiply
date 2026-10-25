import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Colors, type ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { createProject, type ProjectWithCount } from '../services/project.service';

const PROJECT_COLORS = Colors.courseColors;

interface NewProjectModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  /** Called with the newly created project after a successful create. */
  onCreated: (project: ProjectWithCount) => void;
}

export function NewProjectModal({ visible, userId, onClose, onCreated }: NewProjectModalProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Reset form whenever the modal opens
  useEffect(() => {
    if (visible) {
      setName('');
      setSelectedColor(PROJECT_COLORS[0]);
      setError('');
      setIsCreating(false);
    }
  }, [visible]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a project name.');
      return;
    }
    setIsCreating(true);
    setError('');
    try {
      const created = await createProject(userId, trimmed, selectedColor);
      const withCount: ProjectWithCount = { ...created, sessionCount: 0, itemCount: 0 };
      onCreated(withCount);
    } catch (err: any) {
      setError(err?.message ?? 'Could not create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Outer Pressable dismisses on backdrop tap.
          Inner Pressable stops propagation so sheet taps never reach the backdrop. */}
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.title}>New Project</Text>

          <TextInput
            style={styles.input}
            placeholder="Project name"
            placeholderTextColor={c.text.placeholder}
            value={name}
            onChangeText={v => {
              setName(v);
              if (error) setError('');
            }}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            autoCapitalize="words"
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* Color swatches */}
          <View style={styles.swatchRow}>
            {PROJECT_COLORS.map(color => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.swatch,
                  { backgroundColor: color },
                  selectedColor === color && styles.swatchSelected,
                ]}
                onPress={() => setSelectedColor(color)}
                activeOpacity={0.8}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.createButton, isCreating && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={isCreating}
            activeOpacity={0.85}
          >
            {isCreating ? (
              <ActivityIndicator color={c.white} size="small" />
            ) : (
              <Text style={styles.createButtonText}>Create</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'flex-end',
  },
  keyboardView: {
    width: '100%',
  },
  sheet: {
    backgroundColor: c.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 28,
    paddingHorizontal: 24,
    gap: 14,
  },
  title: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: c.text.primary,
    marginBottom: 4,
  },
  input: {
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
  swatchRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  swatchSelected: {
    borderWidth: 2.5,
    borderColor: c.text.primary,
  },
  createButton: {
    backgroundColor: c.black,
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    marginTop: 4,
  },
  createButtonText: {
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
});
