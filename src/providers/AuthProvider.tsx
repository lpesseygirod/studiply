import React, { createContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';

import { getConnection, onBackOnline, subscribe as subscribeConnection } from '../lib/connectivity';
import { readStoredSession, startupState } from '../lib/offlineSession';
import { supabase, supabaseUrl } from '../lib/supabase';
import { getCachedProfile, getProfile, signOut as authSignOut } from '../services/auth.service';
import { forgetConsent } from '../services/consent.service';
import { autoCleanTrash } from '../services/trash.service';
import type { Profile } from '../types/database';

// -------------------------------------------------------------------
// Context shape
// -------------------------------------------------------------------
interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isOnboarded: boolean;
  /**
   * Signed in from the stored session because the server couldn't be
   * reached to refresh it. Requests that need a token wait until it is.
   */
  isOfflineSession: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** How often an offline session tries to refresh while the backend answers. */
const REFRESH_RETRY_MS = 15_000;

// -------------------------------------------------------------------
// AuthProvider
// Supabase Auth is the source of truth: the stored session is restored on
// launch (INITIAL_SESSION) and every sign-in / sign-out arrives through
// onAuthStateChange.
//
// Offline, Supabase reports no session once the access token has expired,
// although the stored session (and its refresh token) is still there. The
// student then stays signed in from that stored session with the profile
// last seen on this device, and the session is refreshed as soon as the
// backend answers again. The stored session is also shown straight away on
// launch, so the library doesn't wait for Supabase's refresh retries.
// -------------------------------------------------------------------
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  // The user whose profile was loaded from the server; token refreshes keep
  // the same user and shouldn't reload it.
  const loadedUserId = useRef<string | null>(null);
  // The stored session used while offline, for the refresh once back online.
  const offlineSession = useRef<Session | null>(null);

  const loadProfile = useCallback(async (s: Session) => {
    const p = await getProfile(s.user);
    // Fire-and-forget: clean up items trashed > 30 days ago.
    autoCleanTrash(p.id).catch(() => {});
    setProfile(p);
  }, []);

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: current },
    } = await supabase.auth.getSession();
    if (!current) return;
    setSession(current);
    await loadProfile(current);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await authSignOut();
    // Offline there is no SIGNED_OUT event; leave the offline session here.
    if (offlineSession.current) {
      offlineSession.current = null;
      loadedUserId.current = null;
      forgetConsent();
      setIsOfflineSession(false);
      setSession(null);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let reported = false;

    // `early`: shown before Supabase has reported, replaced by INITIAL_SESSION.
    const showStored = async (stored: Session, early: boolean) => {
      const cached = await getCachedProfile(stored.user);
      if (cancelled || (early && reported)) return;
      if (!early) {
        offlineSession.current = stored;
        setIsOfflineSession(true);
      }
      setSession(stored);
      setProfile(cached);
      setIsLoading(false);
    };

    readStoredSession(supabaseUrl)
      .then((stored) => {
        if (stored && !reported && !cancelled) return showStored(stored, true);
      })
      .catch(() => {});

    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return;
      reported = true;

      if (!newSession && event === 'INITIAL_SESSION') {
        // Supabase reads storage itself, so this is after any refresh attempt.
        setTimeout(() => {
          readStoredSession(supabaseUrl)
            .then(async (stored) => {
              if (cancelled) return;
              if (startupState(null, stored) === 'offline' && stored) {
                await showStored(stored, false);
              } else {
                signedOut();
              }
            })
            .catch(signedOut);
        }, 0);
        return;
      }

      if (!newSession) {
        signedOut();
        return;
      }

      offlineSession.current = null;
      setIsOfflineSession(false);
      setSession(newSession);
      if (newSession.user.id === loadedUserId.current) {
        if (event === 'INITIAL_SESSION') setIsLoading(false);
        return;
      }
      loadedUserId.current = newSession.user.id;

      // Supabase advises against awaiting other Supabase calls inside this
      // callback, so the profile is loaded after it returns.
      setTimeout(() => {
        loadProfile(newSession).finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      }, 0);
    });

    function signedOut() {
      if (cancelled) return;
      // Another account may sign in next; it must be asked again.
      offlineSession.current = null;
      loadedUserId.current = null;
      forgetConsent();
      setIsOfflineSession(false);
      setSession(null);
      setProfile(null);
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Offline session: refresh it once the backend answers again. Success
  // arrives as TOKEN_REFRESHED; a refused refresh token as SIGNED_OUT.
  useEffect(() => {
    if (!isOfflineSession) return;
    let refreshing = false;

    const tryRefresh = () => {
      const stored = offlineSession.current;
      if (refreshing || !stored || getConnection() !== 'online') return;
      refreshing = true;
      supabase.auth
        .refreshSession({ refresh_token: stored.refresh_token })
        .catch(() => {})
        .finally(() => {
          refreshing = false;
        });
    };

    tryRefresh();
    const offBackOnline = onBackOnline(tryRefresh);
    const offChange = subscribeConnection(tryRefresh);
    const timer = setInterval(tryRefresh, REFRESH_RETRY_MS);
    return () => {
      offBackOnline();
      offChange();
      clearInterval(timer);
    };
  }, [isOfflineSession]);

  const value: AuthContextValue = {
    session,
    profile,
    isLoading,
    isOnboarded: !!session && !!profile,
    isOfflineSession,
    refreshProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
