import { useContext } from 'react';
import { AuthContext } from '../providers/AuthProvider';

/**
 * Access the auth context from any component inside AuthProvider.
 * Throws if used outside of AuthProvider.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
