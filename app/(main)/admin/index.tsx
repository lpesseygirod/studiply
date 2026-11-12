import { Redirect } from 'expo-router';

/** /admin opens its first section (part A: Codes). */
export default function AdminIndex() {
  return <Redirect href="/admin/codes" />;
}
