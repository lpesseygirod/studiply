/**
 * A course's folders as the recording setup's folder picker lists them (Lea's
 * option A): each folder followed by its subfolders, indented by
 * depth, siblings in the order given (the service's sort order, then name).
 * A folder whose parent isn't in the list (deleted) is shown at the top.
 */

export interface FolderLike {
  id: string;
  name: string;
  parent_folder_id: string | null;
}

export interface FolderRow {
  id: string;
  name: string;
  depth: number;
}

export function folderTree(folders: FolderLike[]): FolderRow[] {
  const ids = new Set(folders.map((f) => f.id));
  const children = new Map<string | null, FolderLike[]>();
  for (const f of folders) {
    const parent = f.parent_folder_id && ids.has(f.parent_folder_id) ? f.parent_folder_id : null;
    children.set(parent, [...(children.get(parent) ?? []), f]);
  }
  const out: FolderRow[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      // A loop in bad data never hangs the picker.
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ id: f.id, name: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** "Course" or "Course › Folder › Subfolder", for the picker's button. */
export function folderPath(courseName: string, folders: FolderLike[], folderId: string | null): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  let at = folderId ? byId.get(folderId) : undefined;
  while (at && names.length < 50) {
    names.unshift(at.name);
    at = at.parent_folder_id ? byId.get(at.parent_folder_id) : undefined;
  }
  return [courseName, ...names].join(' › ');
}
