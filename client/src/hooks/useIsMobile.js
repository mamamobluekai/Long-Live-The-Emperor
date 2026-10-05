import { useEffect, useState } from 'react';

// Matches the breakpoint the dashboard shell and sidebar already use for their
// mobile/off-canvas layout, so JS-driven mobile branching and the CSS agree on
// what "phone" means. Anything wider is treated as desktop/tablet and keeps the
// existing full-page behaviour.
const MOBILE_QUERY = '(max-width: 768px)';

const getMatches = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const query = window.matchMedia(MOBILE_QUERY);

    // Handles the user rotating the device or resizing the window across the
    // breakpoint while the sheet is open, which must not leave a stale value.
    const handleChange = (event) => setIsMobile(event.matches);

    // Safari below 14 only implements the deprecated add/removeListener pair.
    if (query.addEventListener) {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }

    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);

  return isMobile;
}

export default useIsMobile;