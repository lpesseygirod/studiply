/**
 * supabase.ts
 * The app's single Supabase client.
 *
 * Only the public URL and anon key are used here; Row Level Security is what
 * protects the data. The service_role key never belongs in the app.
 *
 * Sessions persist in the Keychain on iPhone and localStorage on web (see
 * ./secureStorage), and tokens refresh only while the app is in the
 * foreground, as Supabase recommends for React Native.
 *
 * Every request goes through `connectedFetch`, which adds a timeout and tells
 * ./connectivity whether the backend answered.
 */

import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

import {
  configureProbe,
  isSimulatedOffline,
  probe,
  reportFailure,
  reportReachable,
} from './connectivity';
import { secureStorage } from './secureStorage';
import { pickSupabaseEnv, resolveSupabaseUrl } from './supabaseUrl';
import type { Database } from '../types/supabase';

// Read one by one: Expo replaces each `process.env.EXPO_PUBLIC_…` it sees.
const picked = pickSupabaseEnv({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  remoteUrl: process.env.EXPO_PUBLIC_REMOTE_SUPABASE_URL,
  remoteAnonKey: process.env.EXPO_PUBLIC_REMOTE_SUPABASE_ANON_KEY,
});
const envUrl = picked.url;
/** Public by design (RLS protects the data); also sent by uploads in cloud-storage.service. */
export const anonKey = picked.anonKey;

if (!envUrl || !anonKey) {
  console.warn(
    'Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.',
  );
}

const hostUri = Constants.expoConfig?.hostUri;

export const supabaseUrl = resolveSupabaseUrl({
  envUrl,
  hostUri,
  isDev: __DEV__,
  platform: Platform.OS,
});

if (__DEV__ && Platform.OS !== 'web' && supabaseUrl === envUrl && /127\.0\.0\.1|localhost/.test(envUrl)) {
  console.warn(
    `Supabase URL is ${envUrl}; a physical iPhone can't reach it. Start the app with \`npx expo start\` on the same Wi-Fi so the Mac's address can be used.`,
  );
}

/** Without a timeout a request to an unreachable host waits for the OS (a minute or more). */
const REQUEST_TIMEOUT_MS = 20_000;
const PROBE_TIMEOUT_MS = 4_000;

/** What fetch throws without a connection, so serviceError recognises it. */
function offlineError(): TypeError {
  return new TypeError('Network request failed');
}

async function timedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const outer = init?.signal;
  const forward = () => controller.abort();
  outer?.addEventListener('abort', forward);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    // The caller's own abort stays an abort; a timeout counts as offline.
    if (outer?.aborted) throw err;
    throw offlineError();
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', forward);
  }
}

export async function connectedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (isSimulatedOffline()) throw offlineError();
  try {
    const res = await timedFetch(input, init, REQUEST_TIMEOUT_MS);
    reportReachable();
    return res;
  } catch (err) {
    if (!init?.signal?.aborted) reportFailure();
    throw err;
  }
}

configureProbe(async () => {
  const res = await timedFetch(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: anonKey } }, PROBE_TIMEOUT_MS);
  return res.status < 500;
});
probe().catch(() => {});

export const supabase = createClient<Database>(supabaseUrl, anonKey || 'missing-anon-key', {
  global: { fetch: connectedFetch },
  auth: {
    storage: secureStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      probe().catch(() => {});
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
