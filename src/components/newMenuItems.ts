/**
 * newMenuItems.ts
 * What the "+ New" menu offers (pure, so it is tested without the app).
 */

export type NewAction = 'course' | 'folder' | 'upload' | 'record' | 'document';

export interface NewMenuItem {
  action: NewAction;
  text: string;
  icon: string;
  disabled?: boolean;
  hint?: string;
  /** What VoiceOver reads when the text is short ("Record" → "Record lecture"). */
  accessibilityLabel?: string;
}

/**
 * The items, given what the open screen can do (pure, tested). New folder always works (Lea, 10 Nov):
 * outside a course it asks where ("New folder in…"); Upload still needs the course or folder open.
 */
export function newMenuItems(can: { upload: boolean }): NewMenuItem[] {
  const needsCourse = 'Open a course or folder first';
  return [
    { action: 'course', text: 'New course', icon: 'library-outline' },
    { action: 'folder', text: 'New folder', icon: 'folder-outline' },
    { action: 'upload', text: 'Upload document', icon: 'cloud-upload-outline', ...(!can.upload && { disabled: true, hint: needsCourse }) },
    { action: 'record', text: 'Record', icon: 'mic-outline', accessibilityLabel: 'Record lecture' },
    { action: 'document', text: 'New document', icon: 'create-outline' },
  ];
}

