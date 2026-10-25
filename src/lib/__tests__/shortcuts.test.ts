import { isEditable, shortcutFor, type KeyInput } from '../shortcuts';

const key = (over: Partial<KeyInput>): KeyInput => ({
  code: '',
  key: '',
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  targetIsEditable: false,
  dialogOpen: false,
  ...over,
});

describe('shortcutFor', () => {
  it('⌥N, ⌥⇧N and ⌥R by key position, whatever character Option types', () => {
    expect(shortcutFor(key({ altKey: true, code: 'KeyN', key: '˜' }))).toBe('newDocument');
    expect(shortcutFor(key({ altKey: true, shiftKey: true, code: 'KeyN', key: 'ˆ' }))).toBe('newFolder');
    expect(shortcutFor(key({ altKey: true, code: 'KeyR', key: '®' }))).toBe('record');
    expect(shortcutFor(key({ altKey: true, code: 'KeyX', key: '≈' }))).toBeNull();
  });

  it('"/" and "?" by the character typed (any keyboard layout)', () => {
    expect(shortcutFor(key({ key: '/', code: 'Slash' }))).toBe('focusSearch');
    expect(shortcutFor(key({ key: '/', code: 'Digit7', shiftKey: true }))).toBe('focusSearch'); // Spanish layout
    expect(shortcutFor(key({ key: '?', code: 'Slash', shiftKey: true }))).toBe('showShortcuts');
    expect(shortcutFor(key({ key: 'n', code: 'KeyN' }))).toBeNull();
  });

  it('nothing while typing, with a dialog open, or with ⌘ / Ctrl', () => {
    expect(shortcutFor(key({ altKey: true, code: 'KeyR', targetIsEditable: true }))).toBeNull();
    expect(shortcutFor(key({ key: '/', targetIsEditable: true }))).toBeNull();
    expect(shortcutFor(key({ key: '?', dialogOpen: true }))).toBeNull();
    expect(shortcutFor(key({ altKey: true, metaKey: true, code: 'KeyN' }))).toBeNull();
    expect(shortcutFor(key({ ctrlKey: true, key: '/' }))).toBeNull();
  });
});

describe('⌘Z / Ctrl+Z (step 3.3)', () => {
  it('undoes the last move, delete or favourite', () => {
    expect(shortcutFor(key({ metaKey: true, code: 'KeyZ', key: 'z' }))).toBe('undo');
    expect(shortcutFor(key({ ctrlKey: true, code: 'KeyZ', key: 'z' }))).toBe('undo');
    expect(shortcutFor(key({ metaKey: true, code: 'KeyZ', key: 'y' }))).toBe('undo'); // German layout: by position
  });

  it('not in a field (its own text undo), with a dialog open, with ⇧ (redo) or ⌥', () => {
    expect(shortcutFor(key({ metaKey: true, code: 'KeyZ', targetIsEditable: true }))).toBeNull();
    expect(shortcutFor(key({ metaKey: true, code: 'KeyZ', dialogOpen: true }))).toBeNull();
    expect(shortcutFor(key({ metaKey: true, shiftKey: true, code: 'KeyZ' }))).toBeNull();
    expect(shortcutFor(key({ metaKey: true, altKey: true, code: 'KeyZ' }))).toBeNull();
  });
});

describe('isEditable', () => {
  it('text fields and editable text, not buttons', () => {
    expect(isEditable({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isEditable({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isEditable({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditable({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditable({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isEditable({ tagName: 'DIV' })).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});

describe('cut, copy and the menu key (step 3.4)', () => {
  it('⌘X / ⌘C (or Ctrl), by key position; never with ⇧ or ⌥, in a field or with a dialog open', () => {
    expect(shortcutFor(key({ metaKey: true, code: 'KeyX' }))).toBe('cut');
    expect(shortcutFor(key({ ctrlKey: true, code: 'KeyC' }))).toBe('copy');
    expect(shortcutFor(key({ metaKey: true, shiftKey: true, code: 'KeyC' }))).toBeNull();
    expect(shortcutFor(key({ metaKey: true, code: 'KeyC', targetIsEditable: true }))).toBeNull();
    expect(shortcutFor(key({ metaKey: true, code: 'KeyX', dialogOpen: true }))).toBeNull();
  });

  it('⌘V is not a shortcut (the browser\'s paste event carries the clipboard)', () => {
    expect(shortcutFor(key({ metaKey: true, code: 'KeyV' }))).toBeNull();
  });

  it('⇧F10 or the Menu key opens a menu', () => {
    expect(shortcutFor(key({ shiftKey: true, key: 'F10' }))).toBe('contextMenu');
    expect(shortcutFor(key({ key: 'ContextMenu' }))).toBe('contextMenu');
    expect(shortcutFor(key({ key: 'F10' }))).toBeNull();
  });
});
