import React, { createContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { getProfile, signOut as authSignOut } from '../services/auth.service';
import { ensureLocalProfile } from '../services/localProfile';
import type { Profile } from '../types/database';

// -------------------------------------------------------------------
// Context shape
// -------------------------------------------------------------------
interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isOnboarded: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// -------------------------------------------------------------------
// AuthProvider
// Supabase Auth is the source of truth: the stored session is restored on
// launch (INITIAL_SESSION) and every sign-in / sign-out arrives through
// onAuthStateChange.
// -------------------------------------------------------------------
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // The user whose profile is loaded; token refreshes keep the same user and
  // shouldn't reload it.
  const loadedUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (s: Session) => {
    const p = await getProfile(s.user);
    try {
      // The SQLite services (iPhone) need a local row for this user.
      await ensureLocalProfile(p.id, p.username);
    } catch (err) {
      console.warn('Could not prepare the local profile:', err);
    }
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
  }, []);

  useEffect(() => {
    let cancelled = false;

    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return;
      setSession(newSession);

      const userId = newSession?.user.id ?? null;
      if (userId === loadedUserId.current) {
        if (event === 'INITIAL_SESSION') setIsLoading(false);
        return;
      }
      loadedUserId.current = userId;

      if (!newSession) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      // Supabase calls inside this callback would wait on the auth lock it
      // holds, so the profile is loaded after the callback returns.
      setTimeout(() => {
        loadProfile(newSession).finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      }, 0);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value: AuthContextValue = {
    session,
    profile,
    isLoading,
    isOnboarded: !!session && !!profile,
    refreshProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
