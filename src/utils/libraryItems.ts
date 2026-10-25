import type { LibraryItem } from '../services/move.service';
import type { LibraryFile } from '../services/source-file.service';
import type { Folder, Session } from '../types/database';

/** The app's lists as items "Move to…" (and Phase 2 drag and drop) work with. */

export function lectureItem(session: Session): LibraryItem {
  return { type: 'lecture', id: session.id, title: session.title, courseId: session.project_id, folderId: session.folder_id };
}

export function folderItem(folder: Folder): LibraryItem {
  return {
    type: 'folder',
    id: folder.id,
    title: folder.name,
    // folderFromRow gives '' for a folder outside any course.
    courseId: folder.project_id || null,
    parentId: folder.parent_folder_id,
  };
}

export function libraryFileItem(file: LibraryFile): LibraryItem {
  return { type: 'file', id: file.id, title: file.title, courseId: file.courseId, folderId: file.folderId };
}
