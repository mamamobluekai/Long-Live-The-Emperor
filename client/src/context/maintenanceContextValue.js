import { createContext, useContext } from 'react';

// Split out from MaintenanceContext.jsx so that file only exports components,
// which keeps React Fast Refresh working.
export const MaintenanceContext = createContext(null);

export function useMaintenance() {
  const ctx = useContext(MaintenanceContext);
  if (!ctx) throw new Error('useMaintenance must be used inside MaintenanceProvider');
  return ctx;
}
