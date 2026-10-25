/**
 * deviceId.ts
 * A random id for this installation (iPhone) or browser (web), kept on the
 * device. The conflict rule records which device wrote a note block and uses
 * the id to break a tie between two edits made at the same moment. It says
 * nothing about the student and never leaves their own data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { newId } from './mappers';

const KEY = 'studiply.deviceId';
let cached: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      const stored = await AsyncStorage.getItem(KEY).catch(() => null);
      if (stored) return stored;
      const id = newId();
      await AsyncStorage.setItem(KEY, id).catch(() => {});
      return id;
    })();
  }
  return cached;
}
