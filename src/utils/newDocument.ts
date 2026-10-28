import type { Router } from 'expo-router';

import { showAlert } from '../components/dialogs/dialogs';
import { createDocument } from '../services/document.service';
import { errorMessage } from './errors';

/**
 * New document (step 4.3) from the New menu, the empty-space menu or ⌥N:
 * "Untitled document" in the open course or folder (My library elsewhere),
 * opened with its title selected. Works offline on the iPhone.
 */
export async function newDocumentIn(router: Pick<Router, 'push'>, place: { courseId: string | null; folderId: string | null }): Promise<void> {
  try {
    const id = await createDocument({ courseId: place.courseId, folderId: place.folderId });
    router.push({ pathname: '/doc/[id]', params: { id, created: '1' } });
  } catch (err) {
    showAlert('Could not create the document', errorMessage(err, 'Please try again.'));
  }
}
