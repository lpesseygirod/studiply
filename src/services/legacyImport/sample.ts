/**
 * sample.ts
 * Development only: realistic earlier-version data to test step 1.9 with,
 * in its own database file (studiply-sample.db) and folder
 * (documents/legacy-sample/). The real studiply.db is never touched.
 *
 * Two profiles (Lea's sample and a "local test" one), a course with a
 * folder and subfolder, lectures with notes (clarifications included),
 * transcripts, a PDF and a photo, one lecture in the old trash, one that
 * was trashed too long ago, a recording whose file is missing, and the
 * course's own uploads (a PDF and a photo in a "Project Files" session,
 * which the import turns into library files, step 3.4).
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

import { resetDb, run, SAMPLE_DB_NAME } from '../../lib/db';
import { newId } from '../../lib/mappers';

/** A 1×1 JPEG, enough for a photo row and its upload. */
const PHOTO_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600 * 1000).toISOString();

export async function createSampleEarlierVersion(): Promise<void> {
  if (!__DEV__) return;
  const root = `${FileSystem.documentDirectory}legacy-sample/source-files/`;
  await resetDb(SAMPLE_DB_NAME).catch(() => {});
  await FileSystem.deleteAsync(`${FileSystem.documentDirectory}legacy-sample/`, { idempotent: true });

  const db = SAMPLE_DB_NAME;
  const q = (sql: string, params: (string | number | null)[]) => run(sql, params, db);
  const lea = newId();
  const test = newId();
  const t0 = daysAgo(200);
  const t1 = daysAgo(199);

  await q(`INSERT INTO profiles (id, username, display_name, initials, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [lea, 'Lea (sample)', 'Lea (sample)', 'LS', t0, t0]);
  await q(`INSERT INTO profiles (id, username, display_name, initials, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [test, 'Local test', null, 'LT', daysAgo(30), daysAgo(30)]);

  const psico = newId();
  const tema = newId();
  const neuronas = newId();
  await q(`INSERT INTO projects (id, user_id, name, color, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [psico, lea, 'Psicobiología (sample)', '#C8E8D8', 'folder', t0, t1]);
  await q(`INSERT INTO folders (id, user_id, project_id, parent_folder_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [tema, lea, psico, null, 'Tema 1', t0, t0]);
  await q(`INSERT INTO folders (id, user_id, project_id, parent_folder_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [neuronas, lea, psico, tema, 'Neuronas', t0, t0]);

  const session = async (id: string, owner: string, project: string | null, folder: string | null, title: string, extra: { deletedAt?: string } = {}) =>
    q(
      `INSERT INTO sessions (id, user_id, project_id, folder_id, title, recording_mode, language, status, duration_seconds, is_deleted, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'lecture', 'es', 'completed', 2700, ?, ?, ?, ?)`,
      [id, owner, project, folder, title, extra.deletedAt ? 1 : 0, extra.deletedAt ?? null, t0, t1],
    );
  const clase1 = newId();
  const clase2 = newId();
  const trashed = newId();
  const tooOld = newId();
  await session(clase1, lea, psico, neuronas, 'Clase 1 · La neurona');
  await session(clase2, lea, psico, null, 'Clase 2 · Sinapsis');
  await session(trashed, lea, psico, null, 'Clase borrada hace poco', { deletedAt: daysAgo(5) });
  await session(tooOld, lea, psico, null, 'Clase borrada hace mucho', { deletedAt: daysAgo(60) });

  const note = async (sessionId: string, title: string, clarified: boolean) =>
    q(
      `INSERT INTO notes (id, session_id, user_id, title, summary_level, summary, key_concepts, formulas, definitions, tags, unclear_parts, manual_annotations, is_confirmed, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'standard', ?, ?, '[]', ?, '["neuro"]', '[]', ?, 1, ?, ?)`,
      [
        newId(), sessionId, lea, title,
        'La neurona recibe señales por las dendritas y las transmite por el axón. Mi nota: repasar la bomba sodio-potasio.',
        JSON.stringify([{ term: 'Potencial de acción', explanation: 'Cambio rápido del voltaje de la membrana.' }]),
        JSON.stringify([{ term: 'Sinapsis', definition: 'Unión funcional entre dos neuronas.' }]),
        clarified
          ? JSON.stringify({ clarifications: [{ highlightedParts: ['bomba sodio-potasio'], response: 'Saca 3 Na⁺ y mete 2 K⁺ usando ATP.', createdAt: t1 }] })
          : null,
        t0, t1,
      ],
    );
  await note(clase1, 'La neurona', true);
  await note(clase2, 'Sinapsis', false);
  await note(trashed, 'Nota de una clase borrada', false);

  await q(
    `INSERT INTO transcripts (id, user_id, session_id, language, full_text, segments, confidence_score, created_at) VALUES (?, ?, ?, 'es', ?, ?, 0.91, ?)`,
    [
      newId(), lea, clase1, 'Hoy vemos la neurona. Las dendritas reciben señales.',
      JSON.stringify([{ id: 0, start: 0, end: 4.2, text: 'Hoy vemos la neurona.' }, { id: 1, start: 4.2, end: 9, text: 'Las dendritas reciben señales.' }]),
      t1,
    ],
  );

  // Files: a PDF and a photo kept by the old app, and a recording whose file is gone.
  const dir = `${root}${lea}/${clase1}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const { uri: pdf } = await Print.printToFileAsync({ html: '<h1>Tema 1 · La neurona</h1><p>Diapositivas (sample).</p>' });
  await FileSystem.moveAsync({ from: pdf, to: `${dir}Tema 1 diapositivas.pdf` });
  await FileSystem.writeAsStringAsync(`${dir}pizarra.jpg`, PHOTO_BASE64, { encoding: FileSystem.EncodingType.Base64 });

  const file = async (type: string, path: string, storagePath: string | null, mime: string, sessionId = clase1) =>
    q(
      `INSERT INTO source_files (id, session_id, user_id, file_type, file_path, file_size_bytes, mime_type, retention_policy, storage_path, is_uploaded, created_at)
       VALUES (?, ?, ?, ?, ?, 1000, ?, 'keep_permanently', ?, ?, ?)`,
      [newId(), sessionId, lea, type, path, mime, storagePath, storagePath ? 1 : 0, t0],
    );
  await file('pdf', 'file:///old-install/cache/DocumentPicker/Tema%201%20diapositivas.pdf', `${lea}/${clase1}/Tema 1 diapositivas.pdf`, 'application/pdf');
  await file('photo', 'file:///old-install/cache/ImagePicker/pizarra.jpg', `${lea}/${clase1}/pizarra.jpg`, 'image/jpeg');
  await file('audio', 'file:///old-install/cache/AV/recording-gone.m4a', null, 'audio/m4a');

  // The course's own uploads, in the old app's hidden "Project Files" session (no recording,
  // transcript or notes): the import makes them library files in Tema 1 (step 3.4).
  const uploads = newId();
  await session(uploads, lea, psico, tema, 'Project Files');
  const uploadsDir = `${root}${lea}/${uploads}/`;
  await FileSystem.makeDirectoryAsync(uploadsDir, { intermediates: true });
  const { uri: temario } = await Print.printToFileAsync({ html: '<h1>Temario</h1><p>Psicobiología (sample).</p>' });
  await FileSystem.moveAsync({ from: temario, to: `${uploadsDir}Temario.pdf` });
  await FileSystem.writeAsStringAsync(`${uploadsDir}apuntes.jpg`, PHOTO_BASE64, { encoding: FileSystem.EncodingType.Base64 });
  await file('pdf', 'file:///old-install/cache/DocumentPicker/Temario.pdf', `${lea}/${uploads}/Temario.pdf`, 'application/pdf', uploads);
  await file('photo', 'file:///old-install/cache/ImagePicker/apuntes.jpg', `${lea}/${uploads}/apuntes.jpg`, 'image/jpeg', uploads);

  // The other profile: test lectures from the Mac's local Supabase days.
  const testCourse = newId();
  await q(`INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [testCourse, test, 'Test course', daysAgo(30), daysAgo(30)]);
  await session(newId(), test, testCourse, null, 'Test lecture 1');
}
