/**
 * secureStorage.ts
 * Session storage for Supabase Auth on iPhone, backed by the Keychain.
 *
 * A Supabase session (access token, refresh token, user) is usually larger
 * than the ~2 KB SecureStore accepts reliably per value, so each value is
 * split into chunks: `<key>.n` holds the chunk count and `<key>.0`, `<key>.1`…
 * hold the pieces. The web build uses secureStorage.web.ts instead.
 *
 * Readable while the phone is locked (AFTER_FIRST_UNLOCK): a recording goes
 * on in a pocket and its parts upload then, which needs the session. Items
 * saved before were "when unlocked" (SecureStore's default), and SecureStore
 * only changes the value of an item that exists, never its setting, so
 * `upgrade` (the app in the foreground) deletes and adds each piece again,
 * once; `<key>.a` notes that it was done. Values are never logged.
 */

import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;
const ACCESS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
/** `<key>.a` once the pieces are saved AFTER_FIRST_UNLOCK. */
const UPGRADED = 'after-first-unlock';

// SecureStore keys may only contain letters, digits, ".", "-" and "_";
// Supabase's key looks like "sb-127-auth-token", which already fits, but
// anything else is replaced so a future key can't throw.
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const get = (key: string) => SecureStore.getItemAsync(key, ACCESS);
const set = (key: string, value: string) => SecureStore.setItemAsync(key, value, ACCESS);
const remove = (key: string) => SecureStore.deleteItemAsync(key, ACCESS);

async function readCount(key: string): Promise<number> {
  const raw = await get(`${key}.n`);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function removeChunks(key: string, from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) {
    await remove(`${key}.${i}`);
  }
}

// One Keychain change at a time: an upgrade reads a value and writes it back,
// and a token refresh in between must not be overwritten by the older value.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

/** Names Supabase has used since the app started (what `upgradeAll` upgrades). */
const seen = new Set<string>();
/** The last read failed (the phone locked, the item "when unlocked"). */
let unreadable = false;
const readableListeners = new Set<() => void>();

async function upgrade(name: string): Promise<void> {
  const key = safeKey(name);
  if ((await get(`${key}.a`)) === UPGRADED) return;
  const count = await readCount(key);
  const pieces: [string, string][] = [];
  for (let i = 0; i < count; i++) {
    const value = await get(`${key}.${i}`);
    // An interrupted write: left as it is (getItem reads it as signed out).
    if (value === null) return;
    pieces.push([`${key}.${i}`, value]);
  }
  if (count > 0) pieces.push([`${key}.n`, String(count)]);
  // The count last, as setItem does: until then the old count still matches the pieces.
  for (const [piece, value] of pieces) {
    await remove(piece);
    // Only this copy is left now: tried twice before giving up.
    await set(piece, value).catch(() => set(piece, value));
  }
  await set(`${key}.a`, UPGRADED);
}

export const secureStorage = {
  getItem(name: string): Promise<string | null> {
    seen.add(name);
    return serial(async () => {
      const key = safeKey(name);
      let parts: string[] | null = [];
      try {
        const count = await readCount(key);
        for (let i = 0; i < count && parts; i++) {
          const part = await get(`${key}.${i}`);
          // A missing piece means a write was interrupted; treat it as signed out
          // rather than handing Supabase a corrupt session.
          if (part === null) parts = null;
          else parts.push(part);
        }
      } catch (err) {
        unreadable = true;
        throw err;
      }
      if (unreadable) {
        unreadable = false;
        readableListeners.forEach((fn) => fn());
      }
      return parts && parts.length > 0 ? parts.join('') : null;
    });
  },

  setItem(name: string, value: string): Promise<void> {
    seen.add(name);
    return serial(async () => {
      const key = safeKey(name);
      const previous = await readCount(key);
      const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));

      for (let i = 0; i < count; i++) {
        await set(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await set(`${key}.n`, String(count));
      // A shorter value leaves old trailing chunks behind; drop them.
      await removeChunks(key, count, previous);
    });
  },

  removeItem(name: string): Promise<void> {
    return serial(async () => {
      const key = safeKey(name);
      const count = await readCount(key);
      await remove(`${key}.n`);
      await removeChunks(key, 0, count);
    });
  },

  /**
   * Saves every value used so far again as readable while locked (once per value).
   * Call with the app in the foreground: the old items can only be read unlocked.
   */
  upgradeAll(): Promise<void> {
    return serial(async () => {
      for (const name of seen) await upgrade(name);
    });
  },

  /** Called when a read works again after one failed (the phone was locked). */
  onReadable(fn: () => void): () => void {
    readableListeners.add(fn);
    return () => {
      readableListeners.delete(fn);
    };
  },
};
