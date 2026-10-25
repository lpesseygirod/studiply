import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_LAYOUT_PREFS, parseLayoutPrefs, readLayoutPrefs, saveLayoutPrefs } from '../layoutPrefs';

beforeEach(() => AsyncStorage.clear());

describe('layoutPrefs', () => {
  it('opens both panels when nothing is stored', async () => {
    expect(await readLayoutPrefs()).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it('remembers what was saved', async () => {
    await saveLayoutPrefs({ sidebarOpen: false, assistantOpen: true });
    expect(await readLayoutPrefs()).toEqual({ sidebarOpen: false, assistantOpen: true });
  });

  it('ignores garbage and fills missing values with the defaults', () => {
    expect(parseLayoutPrefs('not json')).toEqual(DEFAULT_LAYOUT_PREFS);
    expect(parseLayoutPrefs('null')).toEqual(DEFAULT_LAYOUT_PREFS);
    expect(parseLayoutPrefs('{"sidebarOpen":"no","assistantOpen":false}')).toEqual({
      sidebarOpen: true,
      assistantOpen: false,
    });
  });
});
