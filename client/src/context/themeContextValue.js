import { createContext, useContext } from 'react';

// Split out from ThemeContext.jsx so that file only exports components, which
// keeps React Fast Refresh working (same pattern as maintenanceContextValue.js).
//
// `theme` is 'light' | 'dark'. `setTheme` persists to localStorage under the
// existing `wim-` key convention and flips <html data-theme> immediately.
export const ThemeContext = createContext(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
