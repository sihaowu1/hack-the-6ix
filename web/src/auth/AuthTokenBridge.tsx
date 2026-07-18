import { useEffect } from 'react';
import { setAccessTokenGetter } from '../api/client';
import { useAuth } from './useAuth';

/** Bridges Auth0 access tokens into the shared API fetch helpers. */
export function AuthTokenBridge() {
  const { configured, isAuthenticated, getAccessToken } = useAuth();

  useEffect(() => {
    if (!configured || !isAuthenticated) {
      setAccessTokenGetter(null);
      return;
    }
    setAccessTokenGetter(getAccessToken);
    return () => setAccessTokenGetter(null);
  }, [configured, isAuthenticated, getAccessToken]);

  return null;
}
