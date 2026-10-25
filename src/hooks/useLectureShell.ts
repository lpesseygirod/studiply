import { useEffect, useState } from 'react';

import { courseCrumbs, useShellScreen } from '../components/shell/ShellContext';
import { getFolderBreadcrumbs, type Breadcrumb } from '../services/folder.service';
import { getProject } from '../services/project.service';
import { getSession } from '../services/session.service';
import type { Session } from '../types/database';

/**
 * The recording flow's place in the laptop shell: the lecture's course ›
 * folder path and title in the top bar, its course open in the sidebar.
 * `title` wins over the stored one (the active screen knows it first).
 */
export function useLectureShell(lectureId: string | undefined, title?: string): void {
  const [info, setInfo] = useState<{ session: Session; chain: Breadcrumb[] } | null>(null);

  useEffect(() => {
    if (!lectureId) return;
    let alive = true;
    (async () => {
      const session = await getSession(lectureId);
      let chain: Breadcrumb[] = [];
      if (session.project_id) {
        const project = await getProject(session.project_id);
        chain = session.folder_id
          ? await getFolderBreadcrumbs(session.folder_id, project.name)
          : [{ id: null, name: project.name, type: 'project' }];
      }
      if (alive) setInfo({ session, chain });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [lectureId]);

  const session = info?.session;
  useShellScreen(
    session ? { courseId: session.project_id, folderId: session.folder_id, itemId: session.id } : null,
    {
      crumbs: session ? courseCrumbs(session.project_id, info.chain) : [],
      title: title || session?.title || '',
      saved: null,
    },
  );
}
