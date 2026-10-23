/**
 * localProfile.web.ts
 * Web build of localProfile.ts. There is no SQLite on web (see PROGRESS
 * decisions): the browser reads Supabase directly, so there is no local
 * profile to keep in step.
 */

export async function ensureLocalProfile(_userId: string, _name: string): Promise<void> {}

export async function updateLocalProfile(_userId: string, _name: string): Promise<void> {}

export async function deleteLocalUserData(_userId: string): Promise<void> {
  throw new Error('Deleting your data from the web app is not available yet.');
}
