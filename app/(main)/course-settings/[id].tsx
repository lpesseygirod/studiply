import { useLocalSearchParams } from 'expo-router';

import { useShellScreen } from '../../../src/components/shell/ShellContext';
import { CourseSettingsScreen } from '../../../src/components/settings/CourseSettings';

/** A course's settings: "Course settings…" in the course's menu. The sidebar shows its course. */
export default function CourseSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useShellScreen({ courseId: id ?? null, folderId: null });
  return id ? <CourseSettingsScreen key={id} courseId={id} /> : null;
}
