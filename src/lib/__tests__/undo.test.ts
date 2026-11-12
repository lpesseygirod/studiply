// The last Undo, for ⌘Z.
import { offerUndo, onUndone, resetUndoForTests, settleUndo, undoLast } from '../undo';

beforeEach(() => resetUndoForTests());

describe('undo', () => {
  it('⌘Z runs the last offer once', () => {
    const run = jest.fn();
    offerUndo("Moved 'Tema 1' to Math", run);
    expect(undoLast()).toBe("Moved 'Tema 1' to Math");
    expect(undoLast()).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('one level: a newer offer replaces the older one', () => {
    const first = jest.fn();
    const second = jest.fn();
    offerUndo('first', first);
    offerUndo('second', second);
    undoLast();
    undoLast();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("after the toast's own Undo, ⌘Z does nothing", () => {
    const run = jest.fn();
    const id = offerUndo('moved', run);
    settleUndo(id);
    expect(undoLast()).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('settling an older offer keeps the newer one', () => {
    const older = offerUndo('older', jest.fn());
    const newer = jest.fn();
    offerUndo('newer', newer);
    settleUndo(older);
    undoLast();
    expect(newer).toHaveBeenCalledTimes(1);
  });

  it('tells the toast which offer ⌘Z used, so it can hide', () => {
    const seen: number[] = [];
    const stop = onUndone((id) => seen.push(id));
    const id = offerUndo('moved', jest.fn());
    undoLast();
    stop();
    offerUndo('again', jest.fn());
    undoLast();
    expect(seen).toEqual([id]);
  });
});
