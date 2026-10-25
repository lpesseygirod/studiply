// Development testing must never read, upload or remove the real earlier-
// version data: the sample switch points everything at its own database
// file and folder.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { all, resetDb } from '../../../lib/db';
import { legacySource, readLegacySnapshot, removeLegacyCopy, setUseSampleData } from '../legacyDb';

jest.mock('../../../lib/db', () => ({
  DB_NAME: 'studiply.db',
  SAMPLE_DB_NAME: 'studiply-sample.db',
  databaseFileUri: (name: string) => `file:///docs/SQLite/${name}`,
  all: jest.fn(async (sql: string) => (sql.includes('profiles') ? [{ id: 'p', username: 'u', display_name: null, created_at: 'x' }] : [])),
  resetDb: jest.fn(async () => {}),
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  deleteAsync: jest.fn(async () => {}),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.mocked(all).mockClear();
  jest.mocked(resetDb).mockClear();
  jest.mocked(FileSystem.deleteAsync).mockClear();
});

describe('the development sample', () => {
  it('by default the real earlier-version data is read', async () => {
    expect(await legacySource()).toEqual({ dbName: 'studiply.db', filesRoot: 'file:///docs/source-files/', sample: false });
  });

  it('with the sample switch on, only studiply-sample.db and its own folder are read and removed', async () => {
    await setUseSampleData(true);
    const source = await legacySource();
    expect(source).toEqual({ dbName: 'studiply-sample.db', filesRoot: 'file:///docs/legacy-sample/source-files/', sample: true });

    await readLegacySnapshot(source);
    const databases = jest.mocked(all).mock.calls.map((call) => call[2]);
    expect(new Set(databases)).toEqual(new Set(['studiply-sample.db']));

    await removeLegacyCopy(source);
    expect(resetDb).toHaveBeenCalledWith('studiply-sample.db');
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///docs/legacy-sample/source-files/', { idempotent: true });
    expect(resetDb).not.toHaveBeenCalledWith('studiply.db');
  });

  it('no old database file: nothing is read and nothing is created', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: false } as never);
    expect(await readLegacySnapshot(await legacySource())).toBeNull();
    expect(all).not.toHaveBeenCalled();
  });
});
