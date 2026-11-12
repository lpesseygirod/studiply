import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '../../hooks/useAuth';
import { recorder } from '../../services/recorder';
import { REFRESH_EVERY_MS, getCreditsState, onCreditsRise, refreshCredits, setCreditsUser } from '../../services/credits.service';

/**
 * Step 10.2-2, mounted once in the main layout: whose credits to read (signing out forgets them), and
 * when to read them again (the app or the tab back in front). Recordings waiting for credits are sent
 * again when she has some: on coming back, and when her balance rises from 0 (at most every 30 s).
 * A summary or quiz that waited is never started here: she starts it (Lea, 12 Nov).
 */
export function CreditsHost() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    void setCreditsUser(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let lastResend = 0;
    const resend = () => {
      const units = getCreditsState().credits?.units;
      if (units === undefined || units <= 0 || !recorder.supported) return;
      if (Date.now() - lastResend < REFRESH_EVERY_MS) return;
      lastResend = Date.now();
      recorder.resendWaiting().catch((err) => console.warn('[credits] could not send the waiting recordings again', err));
    };
    const back = () => {
      void refreshCredits().then(resend);
    };
    const offRise = onCreditsRise(() => {
      lastResend = 0;
      resend();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') back();
    });
    // The laptop: back to this window (AppState follows the tab's visibility only).
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    if (web) window.addEventListener('focus', back);
    return () => {
      offRise();
      app.remove();
      if (web) window.removeEventListener('focus', back);
    };
  }, [userId]);

  return null;
}
