import { showAlert, type DialogButton } from '../components/dialogs/dialogs';
import { setStarredAt, type StarTarget } from '../services/shelf.service';
import { errorMessage } from './errors';

/**
 * Star / Unstar from an item's menu (long-press on the iPhone, right-click on
 * the web). Online only: offline the student gets the "you're offline"
 * message and nothing changes. After a change, an Undo toast puts the
 * previous value back (an older star keeps its place in Starred).
 */

export type ShowUndo = (message: string, onUndo: () => void) => void;

export async function toggleStar(
  target: StarTarget,
  title: string,
  current: string | null,
  showUndo: ShowUndo,
): Promise<boolean> {
  const next = current ? null : new Date().toISOString();
  try {
    await setStarredAt(target, next);
  } catch (err) {
    showAlert(next ? 'Could not star' : 'Could not unstar', errorMessage(err, 'Please try again.'));
    return false;
  }
  showUndo(next ? `Starred "${title}"` : `Unstarred "${title}"`, () => {
    setStarredAt(target, current).catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
  });
  return true;
}

/** The menu item: "Star" or "Unstar". */
export function starButton(
  target: StarTarget,
  title: string,
  current: string | null,
  showUndo: ShowUndo,
): DialogButton {
  return { text: current ? 'Unstar' : 'Star', onPress: () => void toggleStar(target, title, current, showUndo) };
}
