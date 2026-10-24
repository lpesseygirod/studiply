/**
 * DialogHost.tsx
 * Draws the alerts, menus and prompts queued by ./dialogs on the web (and
 * text prompts on Android). On iPhone the native dialogs are used and this
 * renders nothing. Mounted once in app/_layout.tsx.
 *
 * Keyboard: Escape cancels; Enter confirms a prompt or a one-button alert.
 * Clicking outside cancels a menu or prompt (and an alert that has Cancel).
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import {
  dismissDialog,
  runButton,
  subscribeDialogs,
  type DialogButton,
  type DialogRequest,
} from './dialogs';

const MENU_WIDTH = 240;

export default function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  useEffect(() => (Platform.OS === 'ios' ? undefined : subscribeDialogs(setQueue)), []);

  const current = queue[0];
  if (!current) return null;
  return <Dialog key={current.id} request={current} />;
}

function cancelOf(buttons: DialogButton[]): DialogButton | undefined {
  return buttons.find((b) => b.style === 'cancel');
}

function Dialog({ request }: { request: DialogRequest }) {
  const { width, height } = useWindowDimensions();
  const [text, setText] = useState(request.kind === 'prompt' ? request.defaultValue : '');

  const choose = (button: DialogButton | undefined) => {
    dismissDialog(request.id);
    runButton(button);
  };
  const submitPrompt = (value: string | null) => {
    if (request.kind !== 'prompt') return;
    dismissDialog(request.id);
    request.resolve(value);
  };

  /** Escape, or a click outside. Returns false when the dialog must be answered. */
  const cancel = () => {
    if (request.kind === 'prompt') return submitPrompt(null);
    const cancelButton = cancelOf(request.buttons);
    if (request.kind === 'menu') return choose(cancelButton);
    if (cancelButton) return choose(cancelButton);
    if (request.buttons.length === 1) return choose(request.buttons[0]);
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter' && request.kind === 'alert' && request.buttons.length === 1) {
        e.preventDefault();
        choose(request.buttons[0]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const buttonRow = (buttons: DialogButton[]) => (
    <View style={styles.buttonRow}>
      {buttons.map((b) => (
        <Pressable
          key={b.text}
          accessibilityRole="button"
          onPress={() => choose(b)}
          style={({ pressed }) => [
            styles.button,
            b.style === 'cancel' ? styles.buttonCancel : b.style === 'destructive' ? styles.buttonDestructive : styles.buttonPrimary,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, b.style === 'cancel' && styles.buttonTextCancel]}>{b.text}</Text>
        </Pressable>
      ))}
    </View>
  );

  let body: React.ReactNode;
  if (request.kind === 'menu') {
    const items = request.anchor ? request.buttons.filter((b) => b.style !== 'cancel') : request.buttons;
    const anchored = request.anchor
      ? {
          position: 'absolute' as const,
          left: Math.max(8, Math.min(request.anchor.x, width - MENU_WIDTH - 8)),
          top: Math.max(8, Math.min(request.anchor.y, height - (items.length * 44 + 60) - 8)),
          width: MENU_WIDTH,
        }
      : styles.centeredMenu;
    body = (
      <View style={[styles.card, styles.menu, anchored]} accessibilityRole="menu">
        {!!request.title && (
          <Text style={styles.menuTitle} numberOfLines={1}>
            {request.title}
          </Text>
        )}
        {items.map((b) => (
          <Pressable
            key={b.text}
            accessibilityRole="menuitem"
            onPress={() => choose(b)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.menuItem,
              (pressed || hovered) && styles.menuItemActive,
            ]}
          >
            <Text
              style={[
                styles.menuItemText,
                b.style === 'destructive' && styles.menuItemDestructive,
                b.style === 'cancel' && styles.menuItemCancel,
              ]}
            >
              {b.text}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  } else if (request.kind === 'prompt') {
    body = (
      <View style={[styles.card, styles.centered]}>
        <Text style={styles.title}>{request.title}</Text>
        {!!request.message && <Text style={styles.message}>{request.message}</Text>}
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          selectTextOnFocus
          placeholder={request.placeholder}
          placeholderTextColor={Colors.text.placeholder}
          onSubmitEditing={() => submitPrompt(text)}
          style={styles.input}
        />
        <View style={styles.buttonRow}>
          <Pressable accessibilityRole="button" onPress={() => submitPrompt(null)} style={[styles.button, styles.buttonCancel]}>
            <Text style={[styles.buttonText, styles.buttonTextCancel]}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => submitPrompt(text)} style={[styles.button, styles.buttonPrimary]}>
            <Text style={styles.buttonText}>{request.confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    );
  } else {
    body = (
      <View style={[styles.card, styles.centered]} accessibilityRole="alert">
        <Text style={styles.title}>{request.title}</Text>
        {!!request.message && <Text style={styles.message}>{request.message}</Text>}
        {buttonRow(request.buttons)}
      </View>
    );
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={cancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="Close" />
        {body}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    shadowColor: Colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  centered: {
    width: '100%',
    maxWidth: 380,
    padding: 20,
    gap: 12,
  },
  centeredMenu: {
    width: '100%',
    maxWidth: 320,
  },
  title: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  message: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    lineHeight: 21,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    backgroundColor: Colors.offWhite,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: Typography.size.base,
    color: Colors.text.primary,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  button: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: Colors.button.primary },
  buttonDestructive: { backgroundColor: Colors.error },
  buttonCancel: { backgroundColor: Colors.surfaceMuted },
  buttonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.button.primaryText,
  },
  buttonTextCancel: { color: Colors.text.primary },
  pressed: { opacity: 0.8 },
  menu: {
    paddingVertical: 6,
    overflow: 'hidden',
  },
  menuTitle: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  menuItem: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  menuItemActive: { backgroundColor: Colors.surfaceMuted },
  menuItemText: {
    fontSize: Typography.size.base,
    color: Colors.text.primary,
  },
  menuItemDestructive: { color: Colors.error },
  menuItemCancel: { color: Colors.text.secondary },
});
