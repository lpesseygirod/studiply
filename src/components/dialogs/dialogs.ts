/**
 * dialogs.ts
 * Alerts, action menus and text prompts that work on iPhone and on the web.
 *
 * React Native's Alert (with buttons), ActionSheetIOS and Alert.prompt do
 * nothing in a browser, so screens never call them directly. On iPhone
 * these helpers use the native dialogs; elsewhere they queue a request
 * that <DialogHost /> (mounted once in app/_layout.tsx) draws as a modal.
 *
 *   showAlert(title, message?, buttons?)       drop-in for Alert.alert
 *   showActionSheet(title, buttons, options?)  item menus (long-press / right-click)
 *   promptText(title, options?)                one-line text input, e.g. rename
 *   menuTriggerProps(open)                     long-press on iPhone, right-click on web
 */

import type { RefObject } from 'react';
import { ActionSheetIOS, Alert, Platform, type GestureResponderEvent, type View } from 'react-native';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
  /** Menus: shown greyed out with `hint`; on the iPhone choosing it shows the hint. */
  disabled?: boolean;
  /** Menus: a short line under the item ("Open a course first", "Coming soon"). */
  hint?: string;
  /** Menus on the web: an Ionicons name shown before the text. */
  icon?: string;
  /** Menus on the web: what VoiceOver reads when the text is short ("Record" → "Record lecture"). */
  accessibilityLabel?: string;
  /**
   * Menus on the web: a small heading shown above this item, starting a group
   * ("Document", "Page"). The iPhone's action sheet can't show headings; its
   * items keep the same order.
   */
  section?: string;
}

/** Where a menu opens on the web (page coordinates of a right-click). */
export interface Anchor {
  x: number;
  y: number;
}

/**
 * Keyboard in a menu (step 3.4): the item to move to from `current` for
 * ↑ / ↓ (wrapping) and Home / End, skipping greyed-out items; null for any
 * other key, or when nothing can be chosen.
 */
export function nextMenuIndex(enabled: boolean[], current: number, key: string): number | null {
  const usable = enabled.flatMap((on, i) => (on ? [i] : []));
  if (usable.length === 0) return null;
  switch (key) {
    case 'Home':
      return usable[0];
    case 'End':
      return usable[usable.length - 1];
    case 'ArrowDown':
      return usable.find((i) => i > current) ?? usable[0];
    case 'ArrowUp':
      return [...usable].reverse().find((i) => i < current) ?? usable[usable.length - 1];
    default:
      return null;
  }
}

/** Where a menu should open: just below the button. */
export function anchorBelow(ref: RefObject<View | null>): Promise<Anchor | undefined> {
  return new Promise((resolve) => {
    if (!ref.current) return resolve(undefined);
    ref.current.measureInWindow((x, y, _w, h) => resolve({ x, y: y + h + 6 }));
  });
}

export type DialogRequest =
  | { id: number; kind: 'alert'; title: string; message?: string; buttons: DialogButton[] }
  | { id: number; kind: 'menu'; title?: string; message?: string; buttons: DialogButton[]; anchor?: Anchor }
  | {
      id: number;
      kind: 'prompt';
      title: string;
      message?: string;
      defaultValue: string;
      placeholder?: string;
      confirmLabel: string;
      keyboard?: PromptKeyboard;
      resolve: (value: string | null) => void;
    };

/** The keyboard a prompt asks for: numbers only (table sizes), or letters and numbers without autocorrect (colour codes). */
export type PromptKeyboard = 'default' | 'number-pad' | 'ascii-capable';

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

// -------------------------------------------------------------------
// The queue <DialogHost /> draws (web, and Android for prompts)
// -------------------------------------------------------------------
let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<(queue: DialogRequest[]) => void>();

function push(request: DistributiveOmit<DialogRequest, 'id'>): void {
  queue = [...queue, { ...request, id: nextId++ } as DialogRequest];
  listeners.forEach((l) => l(queue));
}

/** A dialog or menu is showing (keyboard shortcuts wait until it closes). */
export function isDialogOpen(): boolean {
  return queue.length > 0;
}

/** Removes a request; DialogHost calls it before running the chosen button. */
export function dismissDialog(id: number): void {
  queue = queue.filter((r) => r.id !== id);
  listeners.forEach((l) => l(queue));
}

export function subscribeDialogs(listener: (queue: DialogRequest[]) => void): () => void {
  listeners.add(listener);
  listener(queue);
  return () => listeners.delete(listener);
}

/** Runs a button's action; errors are logged, never thrown into the UI. */
export function runButton(button: DialogButton | undefined): void {
  if (button?.disabled) {
    // The iPhone's action sheet can't grey an item out: say why it can't be used.
    if (button.hint && Platform.OS !== 'web') Alert.alert(button.text, button.hint);
    return;
  }
  if (!button?.onPress) return;
  Promise.resolve()
    .then(button.onPress)
    .catch((err) => console.warn('[dialogs] Action failed:', err));
}

const isNativeIOS = () => Platform.OS === 'ios';

// -------------------------------------------------------------------
// showAlert — same arguments as Alert.alert
// -------------------------------------------------------------------
export function showAlert(title: string, message?: string, buttons?: DialogButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  push({ kind: 'alert', title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
}

// -------------------------------------------------------------------
// showActionSheet — a menu of actions for one item
// A Cancel button is added when the list has none.
// -------------------------------------------------------------------
export function showActionSheet(
  title: string | undefined,
  buttons: DialogButton[],
  options: { message?: string; anchor?: Anchor } = {},
): void {
  const all = buttons.some((b) => b.style === 'cancel') ? buttons : [...buttons, { text: 'Cancel', style: 'cancel' as const }];

  if (isNativeIOS()) {
    const cancelButtonIndex = all.findIndex((b) => b.style === 'cancel');
    const destructiveButtonIndex = all.flatMap((b, i) => (b.style === 'destructive' ? [i] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      { options: all.map((b) => b.text), cancelButtonIndex, destructiveButtonIndex, title, message: options.message },
      (index) => runButton(all[index]),
    );
    return;
  }
  if (Platform.OS !== 'web') {
    Alert.alert(title ?? '', options.message, all);
    return;
  }
  push({ kind: 'menu', title, message: options.message, buttons: all, anchor: options.anchor });
}

// -------------------------------------------------------------------
// promptText — resolves with the trimmed text, or null when cancelled
// -------------------------------------------------------------------
export function promptText(
  title: string,
  options: { message?: string; defaultValue?: string; placeholder?: string; confirmLabel?: string; keyboard?: PromptKeyboard } = {},
): Promise<string | null> {
  const confirmLabel = options.confirmLabel ?? 'Save';
  return new Promise((resolve) => {
    const done = (value: string | null | undefined) => {
      const trimmed = value?.trim();
      resolve(trimmed ? trimmed : null);
    };
    if (isNativeIOS()) {
      Alert.prompt(
        title,
        options.message,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => done(null) },
          { text: confirmLabel, onPress: (value?: string) => done(value) },
        ],
        'plain-text',
        options.defaultValue ?? '',
        options.keyboard ?? 'default',
      );
      return;
    }
    push({
      kind: 'prompt',
      title,
      message: options.message,
      defaultValue: options.defaultValue ?? '',
      placeholder: options.placeholder,
      confirmLabel,
      keyboard: options.keyboard,
      resolve: done,
    });
  });
}

// -------------------------------------------------------------------
// menuTriggerProps — how an item's menu is opened
// iPhone: long-press. Web: right-click (menu at the pointer) and long-press.
// Spread onto a TouchableOpacity / Pressable.
//
// On the web the right-click is caught with a DOM listener through `ref`:
// TouchableOpacity replaces an onContextMenu prop with its own handler.
// -------------------------------------------------------------------
export function menuTriggerProps(open: (anchor?: Anchor) => void): {
  onLongPress: (e: GestureResponderEvent) => void;
  delayLongPress: number;
  ref?: (node: unknown) => void;
} {
  const props = { onLongPress: () => open(), delayLongPress: 400 };
  if (Platform.OS !== 'web') return props;

  const onContextMenu = (e: MouseEvent) => {
    // An item inside already showed its menu (empty space around tiles has its own).
    if (e.defaultPrevented) return;
    e.preventDefault();
    // The menu is drawn in a full-window overlay, so window coordinates.
    open({ x: e.clientX, y: e.clientY });
  };
  let attached: EventTarget | null = null;
  return {
    ...props,
    // React calls the previous render's ref with null, then this one with the node.
    ref: (node: unknown) => {
      attached?.removeEventListener('contextmenu', onContextMenu as EventListener);
      attached = node && typeof (node as EventTarget).addEventListener === 'function' ? (node as EventTarget) : null;
      attached?.addEventListener('contextmenu', onContextMenu as EventListener);
    },
  };
}
