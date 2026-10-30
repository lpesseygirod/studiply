// Step 5.5: the mark panel's hint follows the level's band (SUMMARY-SPEC
// "What each mark does": 1–3, 4–7, 8–10), and the 1–10 slider's arithmetic.
import { levelAfterKey, levelAt, markBand, markHint, MARK_TEXT } from '../markHints';

describe('mark hints', () => {
  it('bands change at 3/4 and 7/8', () => {
    expect([1, 3, 4, 7, 8, 10].map(markBand)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high']);
  });

  it('each mark has its own hint per band', () => {
    expect(markHint('important', 3)).toBe('In the summary: a chip on its section.');
    expect(markHint('important', 4)).toBe('In the summary: the point is bolded in its section.');
    expect(markHint('important', 8)).toBe('In the summary: in Key takeaways and the self-test.');
    expect(markHint('confused', 7)).toContain('You were confused here');
    expect(markHint('confused', 8)).toContain('practice question');
    expect(markHint('exam', 5)).toBe('In the summary: listed in Exam signals.');
    expect(markHint('exam', 10)).toContain('flashcard');
  });

  it('each mark has its question and labelled ends (DESIGN)', () => {
    expect(MARK_TEXT.important).toMatchObject({ question: 'How important is this?', low: 'Worth noting', high: 'Key idea' });
    expect(MARK_TEXT.confused).toMatchObject({ question: 'How lost are you?', low: 'A bit unsure', high: 'Completely lost' });
    expect(MARK_TEXT.exam).toMatchObject({ question: 'How likely on the exam?', low: 'Maybe', high: 'Certain' });
  });
});

describe('the level slider', () => {
  it('ten stops along the track; outside it, its ends', () => {
    expect([0, 10, 50, 100, 150, 200].map((x) => levelAt(x, 180))).toEqual([1, 2, 4, 6, 9, 10]);
    expect(levelAt(-40, 180)).toBe(1);
    expect(levelAt(90, 0)).toBe(5);
  });

  it('keys: arrows step, Home and End go to the ends, other keys do nothing', () => {
    expect(levelAfterKey(5, 'ArrowRight')).toBe(6);
    expect(levelAfterKey(5, 'ArrowDown')).toBe(4);
    expect(levelAfterKey(10, 'ArrowUp')).toBe(10);
    expect(levelAfterKey(1, 'ArrowLeft')).toBe(1);
    expect(levelAfterKey(5, 'Home')).toBe(1);
    expect(levelAfterKey(5, 'End')).toBe(10);
    expect(levelAfterKey(5, 'a')).toBeNull();
  });
});
