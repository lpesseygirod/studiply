import { newMenuItems } from '../newMenuItems';
import { newFolderHref } from '../library/newFolderState';

describe('the + New menu', () => {
  it('New course, New folder, Upload document, Record, New document', () => {
    const items = newMenuItems({ upload: true });
    expect(items.map((i) => i.text)).toEqual(['New course', 'New folder', 'Upload document', 'Record', 'New document']);
    // VoiceOver still hears what Record does.
    expect(items.find((i) => i.action === 'record')?.accessibilityLabel).toBe('Record lecture');
    expect(items.filter((i) => i.disabled)).toEqual([]);
  });

  it('outside a course only Upload is greyed out with a hint; New folder asks where (Lea, 10 Nov)', () => {
    const items = newMenuItems({ upload: false });
    expect(items.filter((i) => i.disabled).map((i) => [i.action, i.hint])).toEqual([['upload', 'Open a course or folder first']]);
    expect(items.find((i) => i.action === 'folder')).toMatchObject({ text: 'New folder' });
    expect(items.find((i) => i.action === 'folder')?.disabled).toBeUndefined();
    // A new document goes to My library there (step 4.3).
    expect(items.find((i) => i.action === 'document')?.disabled).toBeUndefined();
  });
});

describe('New folder in… (Lea, 10 Nov)', () => {
  it('opens the chosen course, or its folder, with its New folder started', () => {
    expect(newFolderHref({ courseId: 'k1', folderId: null })).toEqual({ pathname: '/project/[id]', params: { id: 'k1', newFolder: '1' } });
    expect(newFolderHref({ courseId: 'k1', folderId: 'f1' })).toEqual({ pathname: '/project/[id]', params: { id: 'k1', folder: 'f1', newFolder: '1' } });
  });
});
