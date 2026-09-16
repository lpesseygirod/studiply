import { all, count, run } from '../lib/db';
import { mapSourceFile, newId, now, type SourceFileRow } from '../lib/mappers';
import type { SourceFile } from '../types/database';

// -------------------------------------------------------------------
// createSourceFile
// -------------------------------------------------------------------
export async function createSourceFile(params: {
  userId: string;
  sessionId: string;
  fileType: 'audio' | 'photo' | 'pdf';
  filePath: string;
  fileSizeBytes?: number;
  mimeType?: string;
  retentionPolicy?: string;
}): Promise<SourceFile> {
  const id = newId();

  await run(
    `INSERT INTO source_files (id, user_id, session_id, file_type, file_path, file_size_bytes,
                               mime_type, retention_policy, scheduled_deletion_at, is_deleted,
                               storage_path, is_uploaded, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, 0, ?)`,
    [
      id,
      params.userId,
      params.sessionId,
      params.fileType,
      params.filePath,
      params.fileSizeBytes ?? null,
      params.mimeType ?? null,
      params.retentionPolicy ?? 'delete_manually',
      now(),
    ],
  );

  const rows = await all<SourceFileRow>(`SELECT * FROM source_files WHERE id = ?`, [id]);
  if (!rows.length) throw new Error('Failed to create source file.');
  return mapSourceFile(rows[0]);
}

// -------------------------------------------------------------------
// getProjectSourceFiles
// Returns all non-deleted photo and PDF files across every session in
// a project, ordered newest first. Used for the project-level files section.
// -------------------------------------------------------------------
export async function getProjectSourceFiles(projectId: string): Promise<SourceFile[]> {
  const rows = await all<SourceFileRow>(
    `SELECT sf.* FROM source_files sf
       JOIN sessions s ON s.id = sf.session_id
      WHERE s.project_id = ? AND s.is_deleted = 0
        AND sf.file_type IN ('photo', 'pdf') AND sf.is_deleted = 0
      ORDER BY sf.created_at DESC`,
    [projectId],
  );
  return rows.map(mapSourceFile);
}

// -------------------------------------------------------------------
// getSourceFiles
// Returns non-deleted files for a session.
// -------------------------------------------------------------------
export async function getSourceFiles(sessionId: string): Promise<SourceFile[]> {
  const rows = await all<SourceFileRow>(
    `SELECT * FROM source_files WHERE session_id = ? AND is_deleted = 0`,
    [sessionId],
  );
  return rows.map(mapSourceFile);
}

// Alias used throughout the UI for clarity.
export const getActiveSourceFiles = getSourceFiles;

// -------------------------------------------------------------------
// getSourceFileCount
// -------------------------------------------------------------------
export async function getSourceFileCount(sessionId: string): Promise<number> {
  return count(
    `SELECT COUNT(*) AS count FROM source_files WHERE session_id = ? AND is_deleted = 0`,
    [sessionId],
  );
}

// -------------------------------------------------------------------
// getStorageStats — per-type counts of a profile's live files
// -------------------------------------------------------------------
export async function getStorageStats(userId: string): Promise<{
  audioCount: number;
  photoCount: number;
  pdfCount: number;
}> {
  const rows = await all<{ file_type: string; count: number }>(
    `SELECT file_type, COUNT(*) AS count FROM source_files
      WHERE user_id = ? AND is_deleted = 0
      GROUP BY file_type`,
    [userId],
  );

  const byType = new Map(rows.map((r) => [r.file_type, r.count]));
  return {
    audioCount: byType.get('audio') ?? 0,
    photoCount: byType.get('photo') ?? 0,
    pdfCount: byType.get('pdf') ?? 0,
  };
}

// -------------------------------------------------------------------
// updateRetention
// -------------------------------------------------------------------
export async function updateRetention(fileId: string, policy: string): Promise<void> {
  await run(`UPDATE source_files SET retention_policy = ? WHERE id = ?`, [policy, fileId]);
}

// -------------------------------------------------------------------
// markDeleted
// Soft delete — does not remove the file from disk.
// -------------------------------------------------------------------
export async function markDeleted(fileId: string): Promise<void> {
  await run(`UPDATE source_files SET is_deleted = 1 WHERE id = ?`, [fileId]);
}

// -------------------------------------------------------------------
// markUploaded
// Records the file's resolved on-device location.
// -------------------------------------------------------------------
export async function markUploaded(fileId: string, storagePath: string): Promise<void> {
  await run(`UPDATE source_files SET storage_path = ?, is_uploaded = 1 WHERE id = ?`, [
    storagePath,
    fileId,
  ]);
}

// -------------------------------------------------------------------
// getPendingUploads
// Source files not yet copied into the app's managed file store.
// -------------------------------------------------------------------
export async function getPendingUploads(userId: string): Promise<SourceFile[]> {
  const rows = await all<SourceFileRow>(
    `SELECT * FROM source_files WHERE user_id = ? AND is_uploaded = 0 AND is_deleted = 0`,
    [userId],
  );
  return rows.map(mapSourceFile);
}

// -------------------------------------------------------------------
// bulkApplyRetention
// Applies a retention policy to all non-deleted files for a session.
// delete_now  → mark all files as is_deleted immediately.
// delete_3_days → set retention_policy + scheduled_deletion_at (now + 3 days).
// delete_manually / keep_permanently → just update retention_policy.
// -------------------------------------------------------------------
export async function bulkApplyRetention(
  sessionId: string,
  policy: 'delete_now' | 'delete_3_days' | 'delete_manually' | 'keep_permanently',
): Promise<void> {
  if (policy === 'delete_now') {
    await run(
      `UPDATE source_files SET is_deleted = 1, retention_policy = 'delete_now'
        WHERE session_id = ? AND is_deleted = 0`,
      [sessionId],
    );
    return;
  }

  if (policy === 'delete_3_days') {
    const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await run(
      `UPDATE source_files SET retention_policy = 'delete_3_days', scheduled_deletion_at = ?
        WHERE session_id = ? AND is_deleted = 0`,
      [scheduledAt, sessionId],
    );
    return;
  }

  // delete_manually | keep_permanently — just update the policy label.
  await run(
    `UPDATE source_files SET retention_policy = ? WHERE session_id = ? AND is_deleted = 0`,
    [policy, sessionId],
  );
}
