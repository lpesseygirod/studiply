/**
 * secureStorage.ts
 * Session storage for Supabase Auth on iPhone, backed by the Keychain.
 *
 * A Supabase session (access token, refresh token, user) is usually larger
 * than the ~2 KB SecureStore accepts reliably per value, so each value is
 * split into chunks: `<key>.n` holds the chunk count and `<key>.0`, `<key>.1`…
 * hold the pieces. The web build uses secureStorage.web.ts instead.
 */

import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;

// SecureStore keys may only contain letters, digits, ".", "-" and "_";
// Supabase's key looks like "sb-127-auth-token", which already fits, but
// anything else is replaced so a future key can't throw.
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(`${key}.n`);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function removeChunks(key: string, from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
}

export const secureStorage = {
  async getItem(name: string): Promise<string | null> {
    const key = safeKey(name);
    const count = await readCount(key);
    if (count === 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      // A missing piece means a write was interrupted; treat it as signed out
      // rather than handing Supabase a corrupt session.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(name: string, value: string): Promise<void> {
    const key = safeKey(name);
    const previous = await readCount(key);
    const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));

    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      );
    }
    await SecureStore.setItemAsync(`${key}.n`, String(count));
    // A shorter value leaves old trailing chunks behind; drop them.
    await removeChunks(key, count, previous);
  },

  async removeItem(name: string): Promise<void> {
    const key = safeKey(name);
    const count = await readCount(key);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await removeChunks(key, 0, count);
  },
};
