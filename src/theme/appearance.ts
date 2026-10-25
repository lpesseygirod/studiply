/**
 * appearance.ts
 * The student's Appearance choice (Settings → General), per device:
 * follow the system, or always Light / Dark.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type Appearance = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

const KEY = 'studiply.appearance';

export function parseAppearance(raw: string | null): Appearance {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** The scheme shown: the choice, or the system's when following it (unknown = light). */
export function schemeFor(appearance: Appearance, system: string | null | undefined): Scheme {
  if (appearance !== 'system') return appearance;
  return system === 'dark' ? 'dark' : 'light';
}

export async function readAppearance(): Promise<Appearance> {
  return parseAppearance(await AsyncStorage.getItem(KEY).catch(() => null));
}

export async function saveAppearance(value: Appearance): Promise<void> {
  await AsyncStorage.setItem(KEY, value).catch(() => {});
}
