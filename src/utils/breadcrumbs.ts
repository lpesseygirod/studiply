import type { Breadcrumb } from '../services/folder.service';

/**
 * The project screen's breadcrumbs after the project was (re)loaded: the
 * root crumb always carries the project's current name, so a rename made
 * elsewhere shows up, while the folders below it stay where the student is.
 */
export function withProjectRoot(prev: Breadcrumb[], projectName: string): Breadcrumb[] {
  const root: Breadcrumb = { id: null, name: projectName, type: 'project' };
  if (prev.length === 0) return [root];
  return [root, ...prev.slice(1)];
}
