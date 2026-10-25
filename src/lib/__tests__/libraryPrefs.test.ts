import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_LIBRARY_PREFS, parseLibraryPrefs, readLibraryPrefs, saveLibraryPrefs } from '../libraryPrefs';

beforeEach(() => AsyncStorage.clear());

describe('libraryPrefs', () => {
  it('Kind + grid + lecture photos closed until changed', async () => {
    expect(await readLibraryPrefs()).toEqual(DEFAULT_LIBRARY_PREFS);
  });
  it('remembers the choice on this device', async () => {
    await saveLibraryPrefs({ sort: 'edited', view: 'list', lecturePhotosOpen: true });
    expect(await readLibraryPrefs()).toEqual({ sort: 'edited', view: 'list', lecturePhotosOpen: true });
  });
  it('ignores anything it does not know', () => {
    expect(parseLibraryPrefs('{"sort":"size","view":"tiles","lecturePhotosOpen":"yes"}')).toEqual(DEFAULT_LIBRARY_PREFS);
    expect(parseLibraryPrefs('not json')).toEqual(DEFAULT_LIBRARY_PREFS);
  });
});
