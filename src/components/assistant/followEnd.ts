/**
 * Whether the study assistant's conversation follows its end (Lea, 6 Nov): it does while the student is
 * at the bottom (within FOLLOW_SLACK_PX); once she scrolls up to read, a streaming answer no longer pulls
 * her down; asking (a typed question or a quick prompt) takes her to the end and it follows again. A
 * summary's Full answer link (step 7.7) keeps its question in view first.
 *
 * Only her own scrolling changes it: the app's scrolls to the end, and the scroll events a layout sends,
 * report a grown conversation before the offset has caught up, which read as "scrolled up".
 */

export const FOLLOW_SLACK_PX = 40;
/** How long after her wheel, trackpad, touch or key a scroll event still counts as hers (smooth scrolling lasts a while). */
export const USER_SCROLL_MS = 600;
/** The keys that scroll the conversation on the web. */
export const SCROLL_KEYS: ReadonlySet<string> = new Set(['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);

export interface ScrollMetrics {
  /** How far it is scrolled (px from the top). */
  offsetY: number;
  /** The visible height. */
  viewHeight: number;
  /** The whole conversation's height. */
  contentHeight: number;
}

/** At the bottom, or near enough (a few pixels of rounding, a last line still growing). */
export function nearEnd(m: ScrollMetrics): boolean {
  return m.contentHeight - m.viewHeight - m.offsetY <= FOLLOW_SLACK_PX;
}

/** When the conversation grows (a word streamed in, a new turn): to the focused question, to the end, or stay. */
export function onGrow(p: { focusing: boolean; following: boolean }): 'focus' | 'end' | 'stay' {
  if (p.focusing) return 'focus';
  return p.following ? 'end' : 'stay';
}

export interface Follower {
  readonly following: boolean;
  /** Her wheel, trackpad, touch or scroll key: the scroll events of the next USER_SCROLL_MS are hers. */
  userInput(): void;
  /** A drag (or its momentum, or the web's scrollbar) began: its scroll events are hers until it ends. */
  dragStart(): void;
  dragEnd(): void;
  /** A scroll event: only hers decide (scrolled up: stop; back within FOLLOW_SLACK_PX of the end: follow). */
  scrolled(m: ScrollMetrics): void;
  /** She asked: to the end, followed through the whole answer. */
  asked(): void;
  /** The app took her elsewhere (a Full answer link's question): stay there as the conversation grows. */
  stop(): void;
}

export function createFollower(now: () => number = Date.now): Follower {
  let following = true;
  let dragging = false;
  let userUntil = 0;
  return {
    get following() {
      return following;
    },
    userInput() {
      userUntil = now() + USER_SCROLL_MS;
    },
    dragStart() {
      dragging = true;
    },
    dragEnd() {
      dragging = false;
      userUntil = now() + USER_SCROLL_MS;
    },
    scrolled(m) {
      if (dragging || now() < userUntil) following = nearEnd(m);
    },
    asked() {
      following = true;
      dragging = false;
      userUntil = 0;
    },
    stop() {
      following = false;
    },
  };
}
