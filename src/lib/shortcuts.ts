/**
 * shortcuts.ts
 * The web app's keyboard shortcuts (step 2.3, Lea's choice):
 *   ⌥N   new document          ⌥⇧N  new folder        ⌥R  record lecture
 *   /    search                ?    the shortcuts sheet
 * Option combinations are matched by the key's position (`code`), so the
 * special characters Option types (˜, ®…) don't matter; "/" and "?" by the
 * character typed, so they work on keyboards where "/" is ⇧7. Nothing fires
 * while typing in a field, while a dialog or menu is open, or with ⌘/Ctrl
 * held (those stay the browser's).
 */

export type ShortcutAction = 'newDocument' | 'newFolder' | 'record' | 'focusSearch' | 'showShortcuts';

export interface KeyInput {
  code: string;
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  /** Focus is in an input, textarea or editable text. */
  targetIsEditable: boolean;
  /** A dialog, menu or the shortcuts sheet is open. */
  dialogOpen: boolean;
}

export function shortcutFor(e: KeyInput): ShortcutAction | null {
  if (e.targetIsEditable || e.dialogOpen || e.metaKey || e.ctrlKey) return null;
  if (e.altKey) {
    if (e.code === 'KeyN') return e.shiftKey ? 'newFolder' : 'newDocument';
    if (e.code === 'KeyR' && !e.shiftKey) return 'record';
    return null;
  }
  if (e.key === '/') return 'focusSearch';
  if (e.key === '?') return 'showShortcuts';
  return null;
}

/** For the shortcuts sheet. */
export const SHORTCUTS: { keys: string; action: string; soon?: boolean }[] = [
  { keys: '⌥ N', action: 'New document', soon: true },
  { keys: '⌥ ⇧ N', action: 'New folder (in the open course)' },
  { keys: '⌥ R', action: 'Record lecture' },
  { keys: '/', action: 'Search' },
  { keys: '?', action: 'Show these shortcuts' },
  { keys: 'Esc', action: 'Close a menu, dialog or this sheet' },
];

/** Whether a DOM element takes typed text. */
export function isEditable(el: unknown): boolean {
  const node = el as { tagName?: string; isContentEditable?: boolean; type?: string } | null;
  if (!node) return false;
  if (node.isContentEditable) return true;
  const tag = (node.tagName ?? '').toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag !== 'input') return false;
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(node.type ?? 'text');
}
