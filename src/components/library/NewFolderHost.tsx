import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';

import { useAuth } from '../../hooks/useAuth';
import { notifyLibraryUpdated } from '../../lib/cache';
import MoveToModal from '../MoveToModal';
import { NewCourseDialog } from '../NewCourseDialog';
import { closeNewFolderPicker, newFolderHref, useNewFolderPicker } from './newFolderState';

type Place = { courseId: string; folderId: string | null };

/**
 * "New folder in…" (Lea, 10 Nov): Move to…'s list of courses and folders, confirmed with Create here;
 * then the place opens with its New folder started ("Untitled folder", named in place). With no
 * course yet: "Make a course first" and New course (the New course dialog; the new course then opens
 * with its New folder started). Drawn once by the app's layout.
 *
 * The place opens only once the picker (or the New course dialog) has finished closing: on the web a
 * closing modal gives focus back to what had it before ("+ New"), and that blur would end the new
 * folder's name at once, saving "Untitled folder" (the advisor's run, 10 Nov).
 */
export function NewFolderHost() {
  const router = useRouter();
  const { profile } = useAuth();
  const visible = useNewFolderPicker();
  const [courseDialog, setCourseDialog] = useState(false);
  const pending = useRef<Place | null>(null);
  if (!profile?.id) return null;
  const choose = (place: Place) => {
    pending.current = place;
    closeNewFolderPicker();
  };
  const openChosen = () => {
    const place = pending.current;
    pending.current = null;
    if (place) router.navigate(newFolderHref(place));
  };
  return (
    <>
      <MoveToModal
        visible={visible && !courseDialog}
        title="New folder in…"
        userId={profile.id}
        confirmText="Create here"
        emptyAction={{ message: 'Make a course first', button: 'New course', onPress: () => setCourseDialog(true) }}
        onMove={(target) => choose({ courseId: target.projectId, folderId: target.folderId })}
        onClose={closeNewFolderPicker}
        onDismiss={openChosen}
      />
      <NewCourseDialog
        visible={courseDialog}
        userId={profile.id}
        onClose={() => setCourseDialog(false)}
        onCreated={(course) => {
          notifyLibraryUpdated();
          choose({ courseId: course.id, folderId: null });
          setCourseDialog(false);
        }}
        onDismiss={openChosen}
      />
    </>
  );
}
