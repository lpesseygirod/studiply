/**
 * supabaseUrl.ts
 * Picks the Supabase URL the app should talk to.
 *
 * In development `.env` points at local Supabase on 127.0.0.1. That works for
 * the browser and the iOS simulator, which run on the Mac, but a real iPhone
 * resolves 127.0.0.1 to itself. Expo Go already reaches the Mac through
 * Metro's address (e.g. "192.168.1.23:8081"), so in development on native we
 * swap the loopback host for that LAN host and keep the Supabase port.
 *
 * Kept pure (no Expo imports) so it can be unit tested.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

export interface ResolveSupabaseUrlInput {
  /** EXPO_PUBLIC_SUPABASE_URL */
  envUrl: string;
  /** Metro's "host:port" from Constants.expoConfig.hostUri; undefined in production builds. */
  hostUri: string | undefined;
  isDev: boolean;
  platform: string;
}

export function resolveSupabaseUrl({
  envUrl,
  hostUri,
  isDev,
  platform,
}: ResolveSupabaseUrlInput): string {
  if (!isDev || platform === 'web') return envUrl;

  let url: URL;
  try {
    url = new URL(envUrl);
  } catch {
    return envUrl;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) return envUrl;

  const lanHost = hostUri?.split(':')[0];
  if (!lanHost || LOOPBACK_HOSTS.has(lanHost)) return envUrl;

  // Rebuilt by hand: React Native's URL setters are not reliable.
  const port = url.port ? `:${url.port}` : '';
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.protocol}//${lanHost}${port}${path}`;
}

export interface BackendInfo {
  kind: 'local' | 'remote';
  /** The remote project's ref ("xmymneartjmdsawlwzyl"), null for local. */
  ref: string | null;
  /** "LOCAL" or "REMOTE (xmym…)", for the development badge. */
  label: string;
}

/**
 * Which server the app talks to, for development builds (Lea: the real
 * import once went to local Supabase without anyone noticing). A hosted
 * project is https://<ref>.supabase.co; anything else (127.0.0.1, the Mac's
 * LAN address) is local Supabase.
 */
export function describeBackend(url: string): BackendInfo {
  const ref = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1] ?? null;
  return ref ? { kind: 'remote', ref, label: `REMOTE (${ref.slice(0, 4)}…)` } : { kind: 'local', ref: null, label: 'LOCAL' };
}
