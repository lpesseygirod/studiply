import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseAppearance, readAppearance, saveAppearance, schemeFor } from '../appearance';

beforeEach(() => AsyncStorage.clear());

describe('appearance', () => {
  it('follows the system unless Light or Dark is chosen', () => {
    expect(schemeFor('system', 'dark')).toBe('dark');
    expect(schemeFor('system', 'light')).toBe('light');
    expect(schemeFor('system', null)).toBe('light');
    expect(schemeFor('light', 'dark')).toBe('light');
    expect(schemeFor('dark', 'light')).toBe('dark');
  });

  it('is remembered on this device; anything else stored means System', async () => {
    expect(await readAppearance()).toBe('system');
    await saveAppearance('dark');
    expect(await readAppearance()).toBe('dark');
    expect(parseAppearance('purple')).toBe('system');
  });
});
