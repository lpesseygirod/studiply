// Recent colours follow the student across devices (step 4.5): each device
// keeps a copy, and the account's list is the union by time, so two devices
// never wipe out each other's colours.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { addRecentColour, loadRecentColours, mergeRecent, pushRecentColours, RECENT_COLOURS } from '../preferences.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);

beforeEach(async () => {
  resetTables();
  await AsyncStorage.clear();
  serverWrite('profiles', { id: 'user-1', preferences: {} });
});

describe('mergeRecent', () => {
  it('keeps each colour once, at its latest pick, newest first, at most 10', () => {
    const laptop = [{ colour: '#dc2626', at: 5 }, { colour: '#2563EB', at: 3 }];
    const iphone = [{ colour: '#DC2626', at: 1 }, { colour: '#16A34A', at: 4 }];
    expect(mergeRecent(laptop, iphone)).toEqual([
      { colour: '#DC2626', at: 5 },
      { colour: '#16A34A', at: 4 },
      { colour: '#2563EB', at: 3 },
    ]);
    const many = Array.from({ length: 14 }, (_, i) => ({ colour: `#0000${(10 + i).toString(16).padStart(2, '0')}`, at: i }));
    expect(mergeRecent(many)).toHaveLength(RECENT_COLOURS);
    expect(mergeRecent(many)[0].at).toBe(13);
  });

  it('ignores what isn\'t a colour', () => {
    expect(mergeRecent([{ colour: 'red', at: 1 }, { colour: '#12', at: 2 }] as never)).toEqual([]);
  });
});

describe('across devices', () => {
  it('a colour picked here joins the account\'s list, which the other device then sees', async () => {
    // The iPhone picked green earlier.
    await pushRecentColours('user-1', [{ colour: '#16A34A', at: 1000 }]);
    // The laptop picks red.
    const list = await addRecentColour('#DC2626', 2000);
    expect(list.map((c) => c.colour)).toEqual(['#DC2626', '#16A34A']);
    expect((rowsOf('profiles')[0].preferences as { recentColours: unknown[] }).recentColours).toHaveLength(2);
    // Other preferences stay.
    serverWrite('profiles', { id: 'user-1', preferences: { ...(rowsOf('profiles')[0].preferences as object), other: 1 } });
    await addRecentColour('#2563EB', 3000);
    expect(rowsOf('profiles')[0].preferences).toMatchObject({ other: 1 });
  });

  it('opens with the account\'s list merged into this device\'s copy', async () => {
    await addRecentColour('#DC2626', 1000);
    await pushRecentColours('user-1', [{ colour: '#9333EA', at: 5000 }]);
    expect((await loadRecentColours()).map((c) => c.colour)).toEqual(['#9333EA', '#DC2626']);
  });
});
