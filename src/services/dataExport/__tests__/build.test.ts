// Step 10.1b-4: one part of "Export my data" as a ZIP; Cancel; offline; reading only as her.
import JSZip from 'jszip';

import { answer, callsOn, resetSupabaseMock, storageCalls } from '../../../test-utils/supabaseMock';
import { buildPart, ExportCancelled, progressLine, type ExportProgress } from '../build';
import type { ExportPart } from '../parts';
import { EXPORT_TABLES } from '../plan';

jest.mock('../../../lib/supabase', () => jest.requireActual('../../../test-utils/supabaseMock').module);
jest.mock('../../../lib/connectivity', () => ({ isOffline: jest.fn(() => false) }));
jest.mock('../save', () => ({ SAVE_OUTPUT: 'uint8array', saveExportPart: jest.fn(async () => {}) }));
jest.mock('../../settings.service', () => ({ getUserSettings: jest.fn(async () => ({ default_language: 'es' })) }));

const connectivity = jest.requireMock('../../../lib/connectivity') as { isOffline: jest.Mock };

const part: ExportPart = {
  index: 1,
  bytes: 0,
  texts: [
    { path: 'README.txt', text: 'Your Studiply data' },
    { path: 'Courses/Psicobiología/Clase 1/My notes.md', text: 'Mis notas\n' },
  ],
  files: [
    { path: 'Courses/Psicobiología/Clase 1/Recording/0000.webm', bucket: 'audio-chunks', storagePath: 'u1/l1/0000.webm', bytes: 4, kind: 'recording' },
    { path: 'Courses/Psicobiología/Clase 1/Photos/Photo 1.jpg', bucket: 'photos', storagePath: 'u1/l1/m1.jpg', bytes: 3, kind: 'photo' },
  ],
};
const bytesOf = (path: string) => new Uint8Array(path.endsWith('.webm') ? [1, 2, 3, 4] : [9, 8, 7]);

describe('buildPart', () => {
  it('a ZIP with the texts and the files as they were stored, reporting its progress', async () => {
    const seen: ExportProgress[] = [];
    const zipped = await buildPart(part, {
      parts: 1,
      fetchFile: async (f) => bytesOf(f.storagePath),
      signal: new AbortController().signal,
      onProgress: (p) => seen.push(p),
      output: 'uint8array',
    });
    const zip = await JSZip.loadAsync(zipped);
    expect(Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort()).toEqual([
      'Courses/Psicobiología/Clase 1/My notes.md',
      'Courses/Psicobiología/Clase 1/Photos/Photo 1.jpg',
      'Courses/Psicobiología/Clase 1/Recording/0000.webm',
      'README.txt',
    ]);
    expect(await zip.file('Courses/Psicobiología/Clase 1/My notes.md')!.async('string')).toBe('Mis notas\n');
    expect([...(await zip.file('Courses/Psicobiología/Clase 1/Recording/0000.webm')!.async('uint8array'))]).toEqual([1, 2, 3, 4]);
    expect(seen.filter((p) => p.stage === 'files').map((p) => p.done)).toEqual([0, 1]);
    expect(seen.some((p) => p.stage === 'zip')).toBe(true);
  });

  it('Cancel between files: stops, fetches nothing more, makes no ZIP', async () => {
    const controller = new AbortController();
    const fetched: string[] = [];
    const run = buildPart(part, {
      parts: 1,
      fetchFile: async (f) => {
        fetched.push(f.storagePath);
        controller.abort();
        return bytesOf(f.storagePath);
      },
      signal: controller.signal,
      output: 'uint8array',
    });
    await expect(run).rejects.toBeInstanceOf(ExportCancelled);
    expect(fetched).toEqual(['u1/l1/0000.webm']);
  });

  it('the progress line', () => {
    expect(progressLine({ part: 1, parts: 1, stage: 'reading', done: 0, total: 0 })).toBe('Reading your library…');
    expect(progressLine({ part: 2, parts: 3, stage: 'files', done: 12, total: 40 })).toBe('Part 2 of 3 · Copying your files: 12 of 40');
    expect(progressLine({ part: 1, parts: 1, stage: 'zip', done: 45, total: 100 })).toBe('Making the ZIP: 45%');
  });
});

describe('prepareExport / runExport', () => {
  // Loaded after the mocks above.
  const { prepareExport, runExport, EXPORT_OFFLINE_MESSAGE } = jest.requireActual('../index') as typeof import('../index');
  const save = jest.requireMock('../save') as { saveExportPart: jest.Mock };

  beforeEach(() => {
    resetSupabaseMock();
    connectivity.isOffline.mockReturnValue(false);
    save.saveExportPart.mockClear();
  });

  it('offline: refused before anything is read', async () => {
    connectivity.isOffline.mockReturnValue(true);
    await expect(prepareExport(new AbortController().signal)).rejects.toThrow(EXPORT_OFFLINE_MESSAGE);
    expect(callsOn('profiles', 'select')).toHaveLength(0);
  });

  it('reads every table through her own client (RLS: no filter by user, nothing written), pages of 1000, and her own folder in each bucket', async () => {
    answer('marks', { data: Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}` })) }, { data: [{ id: 'm1000' }] });
    const prepared = await prepareExport(new AbortController().signal);
    for (const table of EXPORT_TABLES) expect(callsOn(table, 'select').length).toBeGreaterThan(0);
    expect(callsOn('marks', 'range')).toEqual([[0, 999], [1000, 1999]]);
    for (const table of EXPORT_TABLES) {
      for (const write of ['insert', 'update', 'delete', 'upsert']) expect(callsOn(table, write)).toHaveLength(0);
    }
    expect(storageCalls.filter(([, method]) => method === 'list').map(([bucket, , prefix]) => [bucket, prefix])).toEqual([
      ['audio-chunks', 'user-1'],
      ['photos', 'user-1'],
      ['slides', 'user-1'],
    ]);
    expect(JSON.parse(prepared.plan.texts.find((t) => t.path === 'data/marks.json')!.text)).toHaveLength(1001);
    expect(prepared.parts).toHaveLength(1);
  });

  it('runExport saves each part under its name; Cancel saves nothing', async () => {
    const prepared = await prepareExport(new AbortController().signal);
    const names = await runExport(prepared, { signal: new AbortController().signal });
    expect(names).toEqual([`Studiply export ${prepared.exportedAt.slice(0, 10)}.zip`]);
    expect(save.saveExportPart).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    controller.abort();
    await expect(runExport(prepared, { signal: controller.signal })).rejects.toBeInstanceOf(ExportCancelled);
    expect(save.saveExportPart).toHaveBeenCalledTimes(1);
  });
});
