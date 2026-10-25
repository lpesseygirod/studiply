// The web side of the dialogs helper: what DialogHost receives, and the
// right-click wiring. (On iPhone the helpers call the native dialogs.)
import { Platform } from 'react-native';
import {
  dismissDialog,
  menuTriggerProps,
  nextMenuIndex,
  promptText,
  runButton,
  showActionSheet,
  showAlert,
  subscribeDialogs,
  type DialogRequest,
} from '../dialogs';

const realOS = Platform.OS;
let queue: DialogRequest[] = [];
let unsubscribe: () => void;

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  unsubscribe = subscribeDialogs((q) => (queue = q));
  queue.forEach((r) => dismissDialog(r.id));
});

afterEach(() => {
  unsubscribe();
  Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
});

describe('showAlert', () => {
  it('queues the alert with its buttons', () => {
    showAlert('Delete Course', '"Math" will be moved to Recently Deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: 'alert', title: 'Delete Course', buttons: [{ text: 'Cancel' }, { text: 'Delete' }] });
  });

  it('gives a plain alert an OK button', () => {
    showAlert('Error', 'Could not rename project.');
    expect(queue[0]).toMatchObject({ buttons: [{ text: 'OK' }] });
  });

  it('shows one dialog at a time, the next after dismissing', () => {
    showAlert('First');
    showAlert('Second');
    expect(queue.map((r) => r.title)).toEqual(['First', 'Second']);
    dismissDialog(queue[0].id);
    expect(queue.map((r) => r.title)).toEqual(['Second']);
  });
});

describe('showActionSheet', () => {
  it('adds Cancel and keeps the right-click position', () => {
    showActionSheet('Math', [{ text: 'Rename' }, { text: 'Delete Course', style: 'destructive' }], { anchor: { x: 10, y: 20 } });
    expect(queue[0]).toMatchObject({
      kind: 'menu',
      title: 'Math',
      anchor: { x: 10, y: 20 },
      buttons: [{ text: 'Rename' }, { text: 'Delete Course' }, { text: 'Cancel', style: 'cancel' }],
    });
  });
});

describe('promptText', () => {
  it('resolves with the trimmed text, or null when empty or cancelled', async () => {
    const answer = promptText('Rename Folder', { defaultValue: 'Funcions' });
    expect(queue[0]).toMatchObject({ kind: 'prompt', defaultValue: 'Funcions', confirmLabel: 'Save' });
    const request = queue[0] as Extract<DialogRequest, { kind: 'prompt' }>;
    request.resolve('  Funcions 2 ');
    await expect(answer).resolves.toBe('Funcions 2');

    const empty = promptText('Rename Folder');
    (queue.at(-1) as Extract<DialogRequest, { kind: 'prompt' }>).resolve('   ');
    await expect(empty).resolves.toBeNull();
  });
});

describe('runButton', () => {
  it('runs the action and swallows its error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onPress = jest.fn(async () => {
      throw new Error('boom');
    });
    runButton({ text: 'Delete', onPress });
    await new Promise((r) => setTimeout(r, 0));
    expect(onPress).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('menuTriggerProps', () => {
  it('opens on right-click at the pointer and removes the listener on the next render', () => {
    const open = jest.fn();
    const props = menuTriggerProps(open);
    const node = new EventTarget();

    props.ref?.(node);
    const event = Object.assign(new Event('contextmenu', { cancelable: true }), { clientX: 120, clientY: 340 });
    node.dispatchEvent(event);
    expect(open).toHaveBeenCalledWith({ x: 120, y: 340 });
    expect(event.defaultPrevented).toBe(true);

    props.ref?.(null);
    node.dispatchEvent(Object.assign(new Event('contextmenu', { cancelable: true }), { clientX: 1, clientY: 1 }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('long-press opens the menu without a position', () => {
    const open = jest.fn();
    menuTriggerProps(open).onLongPress({} as never);
    expect(open).toHaveBeenCalledWith();
  });
});

describe('disabled menu items (step 3.2, the New menu)', () => {
  it('keep their hint and never run on the web', async () => {
    const run = jest.fn();
    showActionSheet('New', [{ text: 'New folder', disabled: true, hint: 'Open a course or folder first', onPress: run }]);
    expect(queue[0]).toMatchObject({ kind: 'menu', buttons: [{ text: 'New folder', disabled: true, hint: 'Open a course or folder first' }, { text: 'Cancel' }] });
    const menu = queue[0];
    if (menu.kind !== 'menu') throw new Error('expected a menu');
    runButton(menu.buttons[0]);
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('nextMenuIndex (keyboard in a menu, step 3.4)', () => {
  // Rename… · Move to… · Copy (greyed out) · Delete
  const enabled = [true, true, false, true];

  it('↓ and ↑ move, skip greyed-out items and wrap around', () => {
    expect(nextMenuIndex(enabled, 0, 'ArrowDown')).toBe(1);
    expect(nextMenuIndex(enabled, 1, 'ArrowDown')).toBe(3);
    expect(nextMenuIndex(enabled, 3, 'ArrowDown')).toBe(0);
    expect(nextMenuIndex(enabled, 3, 'ArrowUp')).toBe(1);
    expect(nextMenuIndex(enabled, 0, 'ArrowUp')).toBe(3);
  });

  it('Home and End jump to the first and last available item; nothing focused yet (-1) starts at the top', () => {
    expect(nextMenuIndex([false, true, true, false], 3, 'Home')).toBe(1);
    expect(nextMenuIndex([false, true, true, false], 0, 'End')).toBe(2);
    expect(nextMenuIndex(enabled, -1, 'ArrowDown')).toBe(0);
  });

  it('other keys, or a menu with nothing available: null', () => {
    expect(nextMenuIndex(enabled, 0, 'a')).toBeNull();
    expect(nextMenuIndex([false, false], 0, 'ArrowDown')).toBeNull();
  });
});
