import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext } from './themeContextValue';

// Storage key follows the existing `wim-` prefix used by AuthContext
// (wim-user, wim-token, wim-csrf), so the preference lives alongside the
// other client-side state instead of inventing a new namespace.
const STORAGE_KEY = 'wim-theme';

// Documented fallback only: the stored value always wins when present.
const DARK_MEDIA = '(prefers-color-scheme: dark)';

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private mode / disabled storage: fall through to the media query.
  }
  try {
    return window.matchMedia(DARK_MEDIA).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// Applies the theme to <html> so every stylesheet can key off
// [data-theme="dark"]. Also keeps the browser UI (scrollbars, form controls,
// theme-color meta) in sync without a page refresh.
function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#111418' : '#581725');
}

export function ThemeProvider({ children }) {
  // Lazy initialiser reads localStorage once, before the first paint, so the
  // page never flashes the wrong theme on refresh.
  const [theme, setThemeState] = useState(readStoredTheme);

  // Apply on mount and whenever the value changes (covers toggling and any
  // cross-tab change we later mirror in). No refresh required.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    const value = next === 'dark' ? 'dark' : 'light';
    setThemeState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Persisting is best-effort; the in-memory toggle still works.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const value = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        // Ignore: see setTheme.
      }
      return value;
    });
  }, []);

  // Keep other open tabs in sync without adding a custom event bus.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === 'light' || e.newValue === 'dark') setThemeState(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({ theme, isDark: theme === 'dark', setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
