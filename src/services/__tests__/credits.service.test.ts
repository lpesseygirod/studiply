// The one store of her credits (credits.service.ts): read with my_credits(), kept per
// account on the iPhone, forgotten at sign-out, read again after a 402 (throttled), and a rise from 0
// told to CreditsHost (which sends the waiting recordings).

import AsyncStorage from '@react-native-async-storage/async-storage';

import { creditsMayHaveChanged } from '../../lib/credits/signals';
import { getCreditsState, onCreditsRise, refreshCredits, resetCreditsForTests, setCreditsUser } from '../credits.service';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
// The iPhone's (the web keeps nothing on the device).
jest.mock('../../lib/cache/store', () => ({ cacheEnabled: true }));

const rpc = supabase.rpc as unknown as jest.Mock;
const answer = (units: number, extra: Record<string, unknown> = {}) => rpc.mockResolvedValueOnce({ data: { units, history: [], ...extra }, error: null });

beforeEach(async () => {
  resetCreditsForTests();
  rpc.mockReset();
  await AsyncStorage.clear();
});

it('reads her credits at sign-in and keeps a copy for her account', async () => {
  answer(48, { beta: true });
  await setCreditsUser('u1');
  expect(rpc).toHaveBeenCalledWith('my_credits');
  expect(getCreditsState()).toMatchObject({ userId: 'u1', credits: { units: 48, beta: true }, offline: false });
  expect(JSON.parse((await AsyncStorage.getItem('studiply.credits.u1'))!)).toMatchObject({ units: 48 });
});

it('offline: the copy is shown, marked offline', async () => {
  await AsyncStorage.setItem('studiply.credits.u1', JSON.stringify({ units: 12, beta: false, history: [] }));
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
  await setCreditsUser('u1');
  expect(getCreditsState()).toMatchObject({ credits: { units: 12 }, offline: true });
});

it('signing out forgets the copy; another account starts empty', async () => {
  answer(8);
  await setCreditsUser('u1');
  await setCreditsUser(null);
  expect(getCreditsState().credits).toBeNull();
  expect(await AsyncStorage.getItem('studiply.credits.u1')).toBeNull();
});

it('reads again at most every 30 s, unless forced; a 402 asks for a read', async () => {
  answer(8);
  await setCreditsUser('u1');
  await refreshCredits();
  expect(rpc).toHaveBeenCalledTimes(1);
  creditsMayHaveChanged();
  expect(rpc).toHaveBeenCalledTimes(1);
  answer(4);
  await refreshCredits({ force: true });
  expect(getCreditsState().credits?.units).toBe(4);
});

it('a rise from 0 is told once; staying above 0 is not a rise', async () => {
  const rise = jest.fn();
  const off = onCreditsRise(rise);
  answer(0);
  await setCreditsUser('u1');
  expect(rise).not.toHaveBeenCalled();
  answer(8);
  await refreshCredits({ force: true });
  expect(rise).toHaveBeenCalledTimes(1);
  answer(12);
  await refreshCredits({ force: true });
  expect(rise).toHaveBeenCalledTimes(1);
  off();
});
