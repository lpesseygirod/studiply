import React, { createContext, useEffect, useState, useCallback } from 'react';
import {
  getSession,
  onSessionChange,
  type LocalSession,
} from '../lib/session';
import { getProfile, signOut as authSignOut } from '../services/auth.service';
import { autoCleanTrash } from '../services/trash.service';
import type { Profile } from '../types/database';

// -------------------------------------------------------------------
// Context shape
// -------------------------------------------------------------------
interface AuthContextValue {
  session: LocalSession | null;
  profile: Profile | null;
  isLoading: boolean;
  isOnboarded: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// -------------------------------------------------------------------
// AuthProvider
// -------------------------------------------------------------------
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (s: LocalSession) => {
    try {
      const p = await getProfile(s.user.id);
      setProfile(p);
      // Fire-and-forget: clean up items trashed > 30 days ago
      autoCleanTrash(s.user.id).catch(() => {});
    } catch {
      setProfile(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    // There's no token to refresh locally — re-read the session so a signup
    // that just landed is picked up, then reload its profile row.
    const current = await getSession();
    if (!current) return;
    setSession(current);
    await loadProfile(current);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await authSignOut();
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 1. Restore any persisted session on mount
    getSession()
      .then(async (existingSession) => {
        if (cancelled) return;
        setSession(existingSession);
        if (existingSession) {
          await loadProfile(existingSession);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    // 2. Subscribe to sign-in / sign-out
    const subscription = onSessionChange((newSession) => {
      if (cancelled) return;
      setSession(newSession);
      if (newSession) {
        loadProfile(newSession);
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
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
