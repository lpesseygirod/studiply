import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';

import { onLibraryUpdated } from '../../lib/cache';
import { onNotificationTap, takeLaunchTap } from '../../services/reminders/notifier';
import { remindersSupported, requestReschedule } from '../../services/reminders/reminders.service';

/**
 * Mounted once while signed in (the main layout): the review reminders planned again when
 * the app opens or comes back and whenever the library changes (lectures, reviews, an exam date, a
 * lecture's or a course's study reminders), and a tapped reminder opens Review (also when it opened
 * the app). Nothing on the web.
 */
export function RemindersHost() {
  const router = useRouter();
  useEffect(() => {
    if (!remindersSupported) return;
    const openReview = (data: Record<string, unknown> | null) => {
      if (data?.url === '/review') router.navigate('/review');
    };
    requestReschedule();
    takeLaunchTap().then(openReview).catch(() => {});
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') requestReschedule();
    });
    const offLibrary = onLibraryUpdated(requestReschedule);
    const offTap = onNotificationTap(openReview);
    return () => {
      app.remove();
      offLibrary();
      offTap();
    };
  }, [router]);
  return null;
}
