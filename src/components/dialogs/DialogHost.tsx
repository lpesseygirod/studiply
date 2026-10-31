/**
 * DialogHost.tsx
 * Draws the alerts, menus and prompts queued by ./dialogs on the web (and
 * text prompts on Android). On iPhone the native dialogs are used and this
 * renders nothing. Mounted once in app/_layout.tsx.
 *
 * Keyboard: Escape cancels; Enter confirms a prompt or a one-button alert.
 * In a menu (step 3.4) the first available item has the focus; ↑ / ↓ / Tab
 * move (wrapping, skipping greyed-out items), Home / End jump, Enter or
 * Space chooses, and the focus goes back where it was when it closes.
 * Clicking outside cancels a menu or prompt (and an alert that has Cancel).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import {
  dismissDialog,
  nextMenuIndex,
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
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { width, height } = useWindowDimensions();
  const [text, setText] = useState(request.kind === 'prompt' ? request.defaultValue : '');

  // A menu's items (anchored menus have no Cancel line: Escape or a click outside), and the keyboard's place in them.
  const menuItems = request.kind === 'menu' ? (request.anchor ? request.buttons.filter((b) => b.style !== 'cancel') : request.buttons) : [];
  const enabled = menuItems.map((b) => !b.disabled);
  const [active, setActive] = useState(() => nextMenuIndex(enabled, -1, 'Home') ?? -1);
  const itemNodes = useRef<(HTMLElement | null)[]>([]);
  const web = Platform.OS === 'web' && typeof window !== 'undefined';

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

  // Menus: the focus goes back where it was (the tile, the button) when the menu closes.
  useEffect(() => {
    if (!web || request.kind !== 'menu') return;
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (web && active >= 0) itemNodes.current[active]?.focus?.();
  }, [active, web]);

  // Captured before the focused item sees the key, so Enter chooses exactly once.
  useEffect(() => {
    if (!web || request.kind !== 'menu') return;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key === 'Tab' ? (e.shiftKey ? 'ArrowUp' : 'ArrowDown') : e.key;
      const next = nextMenuIndex(enabled, active, key);
      if (next !== null) {
        e.preventDefault();
        e.stopPropagation();
        setActive(next);
      } else if ((e.key === 'Enter' || e.key === ' ') && active >= 0 && enabled[active]) {
        e.preventDefault();
        e.stopPropagation();
        choose(menuItems[active]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
    const items = menuItems;
    // Its height as drawn (items, section headings, the title), never more than the window: a longer
    // menu (a lecture's document menu, step 7.9) scrolls instead of running off the bottom.
    const tall = items.length * 44 + items.filter((b) => b.section).length * 28 + (request.title ? 40 : 0) + 12;
    const maxHeight = height - 16;
    const anchored = request.anchor
      ? {
          position: 'absolute' as const,
          left: Math.max(8, Math.min(request.anchor.x, width - MENU_WIDTH - 8)),
          top: Math.max(8, Math.min(request.anchor.y, height - Math.min(tall, maxHeight) - 8)),
          width: MENU_WIDTH,
          maxHeight,
        }
      : [styles.centeredMenu, { maxHeight }];
    body = (
      <View style={[styles.card, styles.menu, anchored]} accessibilityRole="menu">
        <ScrollView style={styles.menuScroll} bounces={false}>
        {!!request.title && (
          <Text style={styles.menuTitle} numberOfLines={1}>
            {request.title}
          </Text>
        )}
        {items.map((b, i) => (
          <React.Fragment key={b.text}>
          {!!b.section && (
            <Text style={styles.menuSection} accessibilityRole="header">
              {b.section}
            </Text>
          )}
          <Pressable
            ref={(node) => {
              itemNodes.current[i] = node as unknown as HTMLElement | null;
            }}
            onHoverIn={() => !b.disabled && setActive(i)}
            accessibilityRole="menuitem"
            accessibilityState={{ disabled: !!b.disabled }}
            accessibilityHint={b.hint}
            accessibilityLabel={b.accessibilityLabel}
            disabled={b.disabled}
            onPress={() => choose(b)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.menuItem,
              b.icon ? styles.menuItemWithIcon : null,
              !b.disabled && (pressed || hovered || i === active) && styles.menuItemActive,
            ]}
          >
            {!!b.icon && (
              <Ionicons
                name={b.icon as React.ComponentProps<typeof Ionicons>['name']}
                size={18}
                color={b.disabled ? c.text.placeholder : c.text.secondary}
              />
            )}
            <View style={styles.menuItemBody}>
              <Text
                style={[
                  styles.menuItemText,
                  b.style === 'destructive' && styles.menuItemDestructive,
                  b.style === 'cancel' && styles.menuItemCancel,
                  b.disabled && styles.menuItemDisabled,
                ]}
              >
                {b.text}
              </Text>
              {!!b.hint && <Text style={styles.menuItemHint}>{b.hint}</Text>}
            </View>
          </Pressable>
          </React.Fragment>
        ))}
        </ScrollView>
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
          placeholderTextColor={c.text.placeholder}
          onSubmitEditing={() => submitPrompt(text)}
          inputMode={request.keyboard === 'number-pad' ? 'numeric' : 'text'}
          autoCapitalize={request.keyboard === 'ascii-capable' ? 'characters' : undefined}
          autoCorrect={request.keyboard === 'ascii-capable' ? false : undefined}
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: c.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    shadowColor: c.black,
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
    color: c.text.primary,
  },
  message: {
    fontSize: Typography.size.base,
    color: c.text.secondary,
    lineHeight: 21,
  },
  input: {
    borderWidth: 1,
    borderColor: c.surfaceMuted,
    backgroundColor: c.offWhite,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: Typography.size.base,
    color: c.text.primary,
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
  buttonPrimary: { backgroundColor: c.button.primary },
  buttonDestructive: { backgroundColor: c.error },
  buttonCancel: { backgroundColor: c.surfaceMuted },
  buttonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.button.primaryText,
  },
  buttonTextCancel: { color: c.text.primary },
  pressed: { opacity: 0.8 },
  menu: {
    paddingVertical: 6,
    overflow: 'hidden',
  },
  // Only as tall as its items (the card's maxHeight caps it; then it scrolls).
  menuScroll: { flexGrow: 0, flexShrink: 1 },
  menuTitle: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  menuItem: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  menuItemActive: { backgroundColor: c.surfaceMuted },
  menuItemWithIcon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 12 },
  menuItemBody: { flexShrink: 1, paddingVertical: 6 },
  menuItemDisabled: { color: c.text.secondary },
  menuItemHint: { fontSize: Typography.size.xs, color: c.text.secondary },
  menuSection: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  menuItemText: {
    fontSize: Typography.size.base,
    color: c.text.primary,
  },
  menuItemDestructive: { color: c.error },
  menuItemCancel: { color: c.text.secondary },
});
