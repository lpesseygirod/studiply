import { useCallback } from 'react';
import { usePathname, useRouter } from 'expo-router';

import { useAppUndo } from '../../hooks/useAppUndo';
import { isOffline } from '../../lib/connectivity';
import { notifyLibraryUpdated } from '../../lib/cache';
import { syncEnabled } from '../../lib/sync';
import { undoDiscard } from '../../services/discard-recording.service';
import { getDocumentFile } from '../../services/document.service';
import { recordingFlow } from '../../services/recording.service';
import { confirmAction } from '../../utils/confirm';
import { errorMessage } from '../../utils/errors';
import { showAlert } from '../dialogs/dialogs';
import { DISCARD_CONFIRM, DISCARD_TITLE, DISCARDED_NOTICE, DISCARDED_NOTICE_TITLE, discardMessage, discardedToast } from './discardText';

/**
 * Cancel recording (Lea, 6 Nov): Discard recording… in the document menu and Discard recording in the
 * Stop & summarize panel. It asks first, while the recording goes on; only Discard stops it
 * (recording-flow's `discard`). `beforeDiscard`: what to close once the student confirmed (the panel).
 * A new lecture: off its screen if it's open, and the app's toast with Undo; the document cases: a
 * notice that the notes are in version history.
 */
export function useDiscardRecording() {
  const router = useRouter();
  const pathname = usePathname();
  const showUndo = useAppUndo();

  return useCallback(
    async (options: { beforeDiscard?: () => void } = {}): Promise<boolean> => {
      const preview = await recordingFlow.discardPreview();
      if (!preview) return false;
      const file = await getDocumentFile(preview.lectureId).catch(() => null);
      const title = file?.title ?? 'This lecture';
      const message = discardMessage({ origin: preview.origin, title, fromMs: preview.fromMs, offlineHere: syncEnabled && isOffline() });
      if (!(await confirmAction(DISCARD_TITLE, message, DISCARD_CONFIRM))) return false;
      options.beforeDiscard?.();
      let plan;
      try {
        plan = await recordingFlow.discard();
      } catch (err) {
        showAlert('The recording wasn’t discarded', errorMessage(err, 'Please try again.'));
        return false;
      }
      if (!plan) return false;
      if (plan.origin === 'new') {
        if (pathname === `/doc/${plan.lectureId}`) router.replace(file?.course_id ? `/project/${file.course_id}` : '/library');
        showUndo(discardedToast(title), () => {
          undoDiscard(plan.lectureId)
            .then(notifyLibraryUpdated)
            .catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
        });
      } else {
        showAlert(DISCARDED_NOTICE_TITLE, DISCARDED_NOTICE);
      }
      return true;
    },
    [pathname, router, showUndo],
  );
}
