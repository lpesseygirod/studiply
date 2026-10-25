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
