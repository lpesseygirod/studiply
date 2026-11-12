/**
 * Fitting toolbar tools into one row (Lea): the first tools that
 * fit, in order, stay in the row; the rest go to the second row (the
 * laptop's ⌄, the iPhone's arrow). Shared by both toolbars.
 */

/** The first items that fit in `room`, in order; the rest overflow (into the second row). */
export function splitRow<T extends { width: number }>(items: T[], room: number): { fits: T[]; overflow: T[] } {
  let used = 0;
  let cut = items.length;
  for (let i = 0; i < items.length; i++) {
    used += items[i].width;
    if (used > room) {
      cut = i;
      break;
    }
  }
  return { fits: items.slice(0, cut), overflow: items.slice(cut) };
}
