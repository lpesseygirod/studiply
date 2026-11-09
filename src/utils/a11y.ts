/**
 * a11y.ts
 * A control's state for screen readers on both devices (step 10.1b-5). iOS VoiceOver reads React
 * Native's `accessibilityState`; react-native-web 0.21 ignores it and only maps `aria-*` props to
 * the page. Spread this instead of writing `accessibilityState` by hand:
 *
 *   <Pressable accessibilityRole="radio" {...a11yState({ checked: active })} />
 *
 * A Jest test (src/utils/__tests__/a11y.test.ts) fails if a checked / selected / expanded state is
 * written as `accessibilityState={…}` anywhere else.
 */

import type { AccessibilityState } from 'react-native';

export interface A11yStateProps {
  accessibilityState: AccessibilityState;
  'aria-checked'?: boolean | 'mixed';
  'aria-selected'?: boolean;
  'aria-disabled'?: boolean;
  'aria-expanded'?: boolean;
  'aria-busy'?: boolean;
}

export function a11yState(state: AccessibilityState | null | undefined): A11yStateProps {
  const s = state ?? {};
  const props: A11yStateProps = { accessibilityState: s };
  if (s.checked !== undefined) props['aria-checked'] = s.checked;
  if (s.selected !== undefined) props['aria-selected'] = s.selected;
  if (s.disabled !== undefined) props['aria-disabled'] = s.disabled;
  if (s.expanded !== undefined) props['aria-expanded'] = s.expanded;
  if (s.busy !== undefined) props['aria-busy'] = s.busy;
  return props;
}
