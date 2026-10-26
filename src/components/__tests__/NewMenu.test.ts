import { newMenuItems } from '../newMenuItems';

describe('the + New menu', () => {
  it('New course, New folder, Upload document, Record, New document (coming soon)', () => {
    const items = newMenuItems({ folder: true, upload: true });
    expect(items.map((i) => i.text)).toEqual(['New course', 'New folder', 'Upload document', 'Record', 'New document']);
    // VoiceOver still hears what Record does.
    expect(items.find((i) => i.action === 'record')?.accessibilityLabel).toBe('Record lecture');
    expect(items.filter((i) => i.disabled).map((i) => [i.text, i.hint])).toEqual([['New document', 'Coming soon']]);
  });

  it('outside a course, New folder and Upload are greyed out with a hint', () => {
    const items = newMenuItems({ folder: false, upload: false });
    expect(items.filter((i) => i.disabled).map((i) => [i.action, i.hint])).toEqual([
      ['folder', 'Open a course or folder first'],
      ['upload', 'Open a course or folder first'],
      ['document', 'Coming soon'],
    ]);
  });
});
