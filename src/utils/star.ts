import { showAlert, type DialogButton } from '../components/dialogs/dialogs';
import { setStarredAt, type StarTarget } from '../services/shelf.service';
import { errorMessage } from './errors';

/**
 * Add to / Remove from Favorites in an item's menu (long-press on the
 * iPhone, right-click on the web). Favorites are the `starred_at` column.
 * Online only: offline the student gets the "you're offline" message and
 * nothing changes. After a change, an Undo toast puts the previous value
 * back (an older favorite keeps its place in the list).
 */

export type ShowUndo = (message: string, onUndo: () => void) => void;

export async function toggleStar(
  target: StarTarget,
  title: string,
  current: string | null,
  showUndo: ShowUndo,
  /** For screens that keep the item in their own list: its new value. */
  onChanged?: (starredAt: string | null) => void,
): Promise<boolean> {
  const next = current ? null : new Date().toISOString();
  try {
    await setStarredAt(target, next);
  } catch (err) {
    showAlert(next ? 'Could not add to Favorites' : 'Could not remove from Favorites', errorMessage(err, 'Please try again.'));
    return false;
  }
  onChanged?.(next);
  showUndo(next ? 'Added to Favorites' : 'Removed from Favorites', () => {
    setStarredAt(target, current)
      .then(() => onChanged?.(current))
      .catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
  });
  return true;
}

/** The menu item: "Add to Favorites" or "Remove from Favorites". */
export function starButton(
  target: StarTarget,
  title: string,
  current: string | null,
  showUndo: ShowUndo,
  onChanged?: (starredAt: string | null) => void,
): DialogButton {
  return {
    text: current ? 'Remove from Favorites' : 'Add to Favorites',
    onPress: () => void toggleStar(target, title, current, showUndo, onChanged),
  };
}
