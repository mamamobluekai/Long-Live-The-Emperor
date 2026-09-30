import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchMaintenanceStatus,
  getCachedMaintenance,
  reportMaintenance,
  subscribeMaintenance,
} from '../api/maintenanceApi';
import { MaintenanceContext } from './maintenanceContextValue';

// How often to re-check while the app is open. Short enough that turning
// maintenance off brings everyone back without a manual refresh, long enough
// that the public endpoint is not hit constantly.
const POLL_INTERVAL_MS = 45_000;

export function MaintenanceProvider({ children }) {
  const [status, setStatus] = useState(() => getCachedMaintenance());

  const refresh = useCallback(async () => {
    const next = await fetchMaintenanceStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeMaintenance(setStatus);
    const onEvent = (e) => setStatus(e.detail);

    refresh();

    // Immediate re-check when a user comes back to the tab, so a toggle made
    // while they were away applies without waiting for the timer.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('wim:maintenance', onEvent);

    const timer = setInterval(refresh, POLL_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('wim:maintenance', onEvent);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ status, refresh, report: reportMaintenance }),
    [status, refresh]
  );

  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>;
}
