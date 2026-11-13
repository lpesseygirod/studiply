/**
 * shortcuts.ts
 * The web app's keyboard shortcuts (Lea's choice):
 *   ⌥N   new document          ⌥⇧N  new folder        ⌥R  record lecture
 *   /    search                ?    the shortcuts sheet
 *   ⌘Z / Ctrl+Z  undo the last move, delete or favourite
 *   ⌘X / ⌘C      cut / copy the selected item (⌘V is the
 *                browser's paste event, handled by the course screen)
 *   ⇧F10 / Menu  the selected item's menu, or the empty-space menu
 * Option combinations are matched by the key's position (`code`), so the
 * special characters Option types (˜, ®…) don't matter; "/" and "?" by the
 * character typed, so they work on keyboards where "/" is ⇧7. Nothing fires
 * while typing in a field (⌘Z there is the field's own undo) or while a
 * dialog or menu is open; other ⌘/Ctrl combinations stay the browser's.
 */

export type ShortcutAction =
  | 'newDocument'
  | 'newFolder'
  | 'record'
  | 'focusSearch'
  | 'showShortcuts'
  | 'undo'
  | 'cut'
  | 'copy'
  | 'contextMenu';

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
  if (e.targetIsEditable || e.dialogOpen) return null;
  if (e.metaKey || e.ctrlKey) {
    if (e.shiftKey || e.altKey) return null;
    if (e.code === 'KeyZ') return 'undo';
    if (e.code === 'KeyX') return 'cut';
    if (e.code === 'KeyC') return 'copy';
    return null;
  }
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) return 'contextMenu';
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
  { keys: '⌥ N', action: 'New document (in the open course or folder)' },
  { keys: '⌥ ⇧ N', action: 'New folder (in the open course, or choose where)' },
  { keys: '⌥ R', action: 'Record' },
  { keys: '/', action: 'Search' },
  { keys: '?', action: 'Show these shortcuts' },
  { keys: '⌘ Z', action: 'Undo the last move, delete or favourite' },
  { keys: '⌘ X  ⌘ C  ⌘ V', action: 'Cut, copy, paste the selected item (⌘V also adds a copied image or PDF)' },
  { keys: '⇧ F10', action: 'Open the menu of the selected item (or of the empty space)' },
  { keys: 'Esc', action: 'Close a menu, dialog or this sheet' },
];

/** In a document, as in Google Docs; they work while typing in the text. */
export const EDITOR_SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '⌘ B  ⌘ I  ⌘ U', action: 'Bold, italic, underline' },
  { keys: '⌘ ⇧ X', action: 'Strikethrough' },
  { keys: '⌘ ⌥ 0 · 1 · 2 · 3', action: 'Normal text, Heading 1, Heading 2, Subheading' },
  { keys: '⌘ ⇧ 7 · 8 · 9', action: 'Numbered, bulleted, checklist' },
  { keys: '⌘ ⇧ L · E · R · J', action: 'Align left, centre, right, justify' },
  { keys: '⌘ ]  ⌘ [', action: 'Increase, decrease indent (Tab, ⇧Tab too)' },
  { keys: '⌘ ⇧ .  ⌘ ⇧ ,', action: 'Bigger, smaller text' },
  { keys: '⌘ ↵', action: 'Page break' },
  { keys: '⌘ \\', action: 'Clear formatting' },
  { keys: '⌘ ⇧ V', action: 'Paste without formatting' },
  { keys: '⌘ Z  ⌘ ⇧ Z', action: 'Undo, redo in the text' },
  { keys: '⌘ +  ⌘ −  ⌘ 0', action: 'Zoom in, zoom out, 100 %' },
  { keys: '⌘ F  ⌘ ⇧ H', action: 'Find, find and replace (↵ next, ⇧↵ previous, Esc closes)' },
  { keys: '⌘ ⌥ A', action: 'Show or hide the outline' },
  // Typing shortcuts (after test C), on both devices.
  { keys: '-  1.  []', action: 'Then a space, at the start of a line: bulleted, numbered, checklist' },
  { keys: '#  ##  ###  >', action: 'Then a space, at the start of a line: Heading 1, Heading 2, Subheading, quote' },
  { keys: '$…$  $$…$$', action: 'A formula as you type; $$…$$ alone on a line is a display formula' },
  { keys: '**…**  *…*  ~~…~~  ==…==', action: 'Bold, italic, strikethrough, highlight as you type' },
  { keys: '⌫', action: 'Right after a typing shortcut: back to what you typed' },
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
