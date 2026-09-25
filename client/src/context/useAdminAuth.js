import { useContext } from 'react';
import { AdminAuthContext } from './adminAuthContextValue';

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
