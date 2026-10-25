/**
 * localProfile.web.ts
 * Web build of localProfile.ts. There is no SQLite on web (see PROGRESS
 * decisions), so a browser holds no data from earlier app versions.
 */

export async function deleteLocalUserData(_userId: string): Promise<void> {
  throw new Error('Deleting your data from the web app is not available yet.');
}
