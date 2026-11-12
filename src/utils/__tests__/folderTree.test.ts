// The recording setup's folder picker (Lea's option A: the course,
// then a folder in it) and what its button says; also the strip's clock and
// what it says after Stop.
import { folderPath, folderTree } from '../folderTree';
import { clock } from '../clock';
import { savingText } from '../../components/recording/savingText';

const f = (id: string, name: string, parent: string | null = null) => ({ id, name, parent_folder_id: parent });

describe('the folder picker', () => {
  const folders = [f('t1', 'Tema 1'), f('ex', 'Exams'), f('t1a', 'Lecturas', 't1'), f('t1b', 'Ejercicios', 't1'), f('deep', 'Hoja 1', 't1b')];

  it('lists each folder followed by its subfolders, indented, siblings in the given order', () => {
    expect(folderTree(folders).map((r) => `${'  '.repeat(r.depth)}${r.name}`)).toEqual([
      'Tema 1',
      '  Lecturas',
      '  Ejercicios',
      '    Hoja 1',
      'Exams',
    ]);
  });

  it('a folder whose parent is gone shows at the top; a loop never hangs it', () => {
    expect(folderTree([f('orphan', 'Orphan', 'deleted')]).map((r) => [r.name, r.depth])).toEqual([['Orphan', 0]]);
    const loop = [f('a', 'A', 'b'), f('b', 'B', 'a')];
    expect(folderTree(loop)).toEqual([]);
  });

  it('the button: Course › folder › subfolder', () => {
    expect(folderPath('Psicobiología', folders, 'deep')).toBe('Psicobiología › Tema 1 › Ejercicios › Hoja 1');
    expect(folderPath('Psicobiología', folders, null)).toBe('Psicobiología');
  });
});

describe('the recording clock and the strip after Stop', () => {
  it('mm:ss, and h:mm:ss past an hour', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(34 * 60_000 + 12_999)).toBe('34:12');
    expect(clock(3_725_000)).toBe('1:02:05');
  });

  it('says what is still being sent', () => {
    const at = { lectureId: 'l', left: 2, offline: false, finishing: false };
    expect(savingText(at)).toBe('Saving the recording · sending 2 parts…');
    expect(savingText({ ...at, left: 1, offline: true })).toBe("Saved here · 1 part will be sent when you're back online");
    expect(savingText({ ...at, left: 0, finishing: true })).toBe('Saving the recording · finishing the transcript…');
    expect(savingText({ ...at, left: 0 })).toBe('Saving the recording…');
  });
});
