import { useCallback, useState, type RefObject } from 'react';
import type { View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../hooks/useAuth';
import { notifyLibraryUpdated } from '../lib/cache';
import { NewCourseDialog } from './NewCourseDialog';
import { showActionSheet, type Anchor, type DialogButton } from './dialogs/dialogs';
import { hasShellCommand, recordHref, runShellCommand, useShell } from './shell/ShellContext';

/**
 * The "+ New" menu (Lea, like Google Drive's New): a small menu next to the
 * button on the laptop, an action sheet on the iPhone.
 */

import { newMenuItems, type NewAction } from './newMenuItems';

export { newMenuItems } from './newMenuItems';
export type { NewAction, NewMenuItem } from './newMenuItems';

/** Where a menu should open: just below the button. */
export function anchorBelow(ref: RefObject<View | null>): Promise<Anchor | undefined> {
  return new Promise((resolve) => {
    if (!ref.current) return resolve(undefined);
    ref.current.measureInWindow((x, y, _w, h) => resolve({ x, y: y + h + 6 }));
  });
}

/** The New menu and the New course dialog it opens. Render `dialog` once. */
export function useNewMenu() {
  const router = useRouter();
  const { location } = useShell();
  const { profile } = useAuth();
  const [courseDialog, setCourseDialog] = useState<{ anchor?: Anchor } | null>(null);

  const open = useCallback(
    (anchor?: Anchor) => {
      const run: Record<NewAction, () => void> = {
        course: () => setCourseDialog({ anchor }),
        folder: () => runShellCommand('newFolder'),
        upload: () => runShellCommand('upload'),
        record: () => router.navigate(recordHref(location)),
        document: () => {},
      };
      const buttons: DialogButton[] = newMenuItems({
        folder: hasShellCommand('newFolder'),
        upload: hasShellCommand('upload'),
      }).map((item) => ({ text: item.text, icon: item.icon, disabled: item.disabled, hint: item.hint, onPress: run[item.action] }));
      showActionSheet('New', buttons, { anchor });
    },
    [router, location],
  );

  const dialog = profile?.id ? (
    <NewCourseDialog
      visible={!!courseDialog}
      userId={profile.id}
      anchor={courseDialog?.anchor}
      onClose={() => setCourseDialog(null)}
      onCreated={(course) => {
        setCourseDialog(null);
        notifyLibraryUpdated();
        router.navigate(`/project/${course.id}`);
      }}
    />
  ) : null;

  return { open, dialog };
}
