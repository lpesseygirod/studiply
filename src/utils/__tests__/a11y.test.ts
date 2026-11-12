// A control's checked / selected / expanded state reaches screen readers on the web too.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { a11yState } from '../a11y';

const root = join(__dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') sources(path, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

describe('a11yState', () => {
  it('sets accessibilityState (iOS) and the aria-* the web reads', () => {
    expect(a11yState({ checked: true, disabled: false })).toEqual({ accessibilityState: { checked: true, disabled: false }, 'aria-checked': true, 'aria-disabled': false });
    expect(a11yState({ selected: false })).toEqual({ accessibilityState: { selected: false }, 'aria-selected': false });
    expect(a11yState({ expanded: true })).toEqual({ accessibilityState: { expanded: true }, 'aria-expanded': true });
    expect(a11yState({ checked: 'mixed' })['aria-checked']).toBe('mixed');
    expect(a11yState(undefined)).toEqual({ accessibilityState: {} });
  });
});

describe('every checked / selected / expanded state goes through a11yState', () => {
  // react-native-web 0.21 ignores accessibilityState: written by hand, the web never hears the state.
  // Only `{ disabled }` / `{ disabled: … }` alone may stay (a Pressable's own disabled prop already tells the web).
  const byHand = /accessibilityState=\{(?!\{\s*disabled(:\s*[^,}]+)?\s*\}\})/;

  it('no accessibilityState={…} with checked, selected or expanded (or a variable) in app/ or src/', () => {
    const offenders = [...sources(join(root, 'app')), ...sources(join(root, 'src'))]
      .filter((f) => !f.endsWith(join('utils', 'a11y.ts')))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => [line, i] as const)
          .filter(([line]) => byHand.test(line))
          .map(([line, i]) => `${relative(root, f)}:${i + 1}  ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it('the guard catches one', () => {
    for (const line of ['accessibilityState={{ checked: on }}', 'accessibilityState={{ selected }}', 'accessibilityState={state}', 'accessibilityState={{ expanded: open, disabled }}', 'accessibilityState={{ disabled: off, selected: on }}']) {
      expect(byHand.test(line)).toBe(true);
    }
    expect(byHand.test('accessibilityState={{ disabled: !ready }}')).toBe(false);
  });
});
