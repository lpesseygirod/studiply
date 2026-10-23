/**
 * secureStorage.web.ts
 * Session storage for Supabase Auth in the browser: localStorage.
 *
 * There is no Keychain on the web; localStorage is what Supabase uses by
 * default there. `window` is checked so a server-side render can't throw.
 */

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
}

export const secureStorage = {
  async getItem(name: string): Promise<string | null> {
    return storage()?.getItem(name) ?? null;
  },

  async setItem(name: string, value: string): Promise<void> {
    storage()?.setItem(name, value);
  },

  async removeItem(name: string): Promise<void> {
    storage()?.removeItem(name);
  },
};
