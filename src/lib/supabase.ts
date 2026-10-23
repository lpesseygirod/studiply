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
 */

import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

import { secureStorage } from './secureStorage';
import { resolveSupabaseUrl } from './supabaseUrl';
import type { Database } from '../types/supabase';

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
/** Public by design (RLS protects the data); also sent by uploads in cloud-storage.service. */
export const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

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

export const supabase = createClient<Database>(supabaseUrl, anonKey || 'missing-anon-key', {
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
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
