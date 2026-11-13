// Lea, 6 Nov: the study assistant's conversation follows its end only while she is at the bottom;
// scrolled up to read, a streaming answer leaves her where she is; a Full answer link comes first.
// Only her own scrolling decides: the app's scroll to the end and a layout's scroll events never stop it.
import { FOLLOW_SLACK_PX, USER_SCROLL_MS, createFollower, nearEnd, onGrow } from '../followEnd';

/** 400 px visible of `contentHeight`, scrolled to `offsetY`. */
const at = (offsetY: number, contentHeight = 1000) => ({ offsetY, viewHeight: 400, contentHeight });

describe('following the end of the conversation', () => {
  it('at the bottom, or within 40 px of it, counts as at the end', () => {
    expect(nearEnd(at(600))).toBe(true);
    expect(nearEnd(at(600 - FOLLOW_SLACK_PX))).toBe(true);
    expect(nearEnd(at(600 - FOLLOW_SLACK_PX - 1))).toBe(false);
    // Shorter than the view: nothing to scroll, at the end.
    expect(nearEnd(at(0, 300))).toBe(true);
  });

  it('a growing answer: to the end while following, otherwise it stays; a focused question first', () => {
    expect(onGrow({ focusing: false, following: true })).toBe('end');
    expect(onGrow({ focusing: false, following: false })).toBe('stay');
    expect(onGrow({ focusing: true, following: true })).toBe('focus');
    expect(onGrow({ focusing: true, following: false })).toBe('focus');
  });
});

describe('only her own scrolling stops it', () => {
  let t = 0;
  const follower = () => createFollower(() => t);
  beforeEach(() => {
    t = 1000;
  });

  it('the app scrolling, or a layout reporting a grown conversation before its offset: still following', () => {
    const f = follower();
    // The failing run: scrolled to the old end (2180 of 2681), then the new turn made it 3092 tall.
    f.scrolled({ offsetY: 2180, viewHeight: 501, contentHeight: 3092 });
    expect(f.following).toBe(true);
    // Also long after any input of hers.
    f.userInput();
    t += USER_SCROLL_MS;
    f.scrolled(at(0));
    expect(f.following).toBe(true);
  });

  it('her wheel (or touch, or a key) up: stops; her scroll back within 40 px of the end: follows again', () => {
    const f = follower();
    f.userInput();
    f.scrolled(at(300));
    expect(f.following).toBe(false);
    // The answer grows; the app's events don't bring it back.
    t += 2000;
    f.scrolled(at(300, 1600));
    expect(f.following).toBe(false);
    f.userInput();
    t += 100;
    f.scrolled(at(1600 - 400 - FOLLOW_SLACK_PX, 1600));
    expect(f.following).toBe(true);
  });

  it('a drag and its momentum (iPhone) or the scrollbar (web): hers for as long as it lasts, and a little after', () => {
    const f = follower();
    f.dragStart();
    t += 5000;
    f.scrolled(at(100));
    expect(f.following).toBe(false);
    f.dragEnd();
    t += USER_SCROLL_MS - 1;
    f.scrolled(at(600));
    expect(f.following).toBe(true);
  });

  it('asking: to the end and followed through the whole answer, even right after her own scroll', () => {
    const f = follower();
    f.userInput();
    f.scrolled(at(0));
    expect(f.following).toBe(false);
    f.asked();
    // RN-web's late scroll-end event, read after the new turn grew: not hers any more.
    t += 100;
    f.scrolled({ offsetY: 2180, viewHeight: 501, contentHeight: 3092 });
    expect(f.following).toBe(true);
    // A drag that hadn't ended is over too.
    f.dragStart();
    f.asked();
    f.scrolled(at(0));
    expect(f.following).toBe(true);
  });

  it('a Full answer link (7.7) took her to its question: it stays there until she scrolls to the end or asks', () => {
    const f = follower();
    f.stop();
    expect(onGrow({ focusing: false, following: f.following })).toBe('stay');
    f.userInput();
    f.scrolled(at(600));
    expect(f.following).toBe(true);
  });
});
