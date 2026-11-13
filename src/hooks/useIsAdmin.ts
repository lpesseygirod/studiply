import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from './useAuth';
import { amIAdmin } from '../services/codes.service';

/** Per account, for this session (the server decides; this only shows or hides the Admin entry). */
const known = new Map<string, boolean>();

/**
 * Whether the signed-in student is an admin, on the web only (the dashboard is the laptop's; the iPhone
 * app never asks). null while unknown.
 */
export function useIsAdmin(): boolean | null {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const web = Platform.OS === 'web';
  const [admin, setAdmin] = useState<boolean | null>(() => (userId && known.has(userId) ? known.get(userId)! : null));
  useEffect(() => {
    if (!web || !userId) {
      setAdmin(false);
      return;
    }
    if (known.has(userId)) {
      setAdmin(known.get(userId)!);
      return;
    }
    let live = true;
    amIAdmin()
      .then((yes) => {
        known.set(userId, yes);
        if (live) setAdmin(yes);
      })
      .catch(() => live && setAdmin(false));
    return () => {
      live = false;
    };
  }, [userId, web]);
  return admin;
}
