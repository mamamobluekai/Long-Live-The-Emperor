import { useEffect } from 'react';

const isEditable = (element) =>
  element instanceof HTMLElement
  && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT')
  && element.type !== 'checkbox'
  && element.type !== 'radio'
  && element.type !== 'range'
  && element.type !== 'file';

/**
 * Keeps focused inputs visible while the mobile keyboard is open.
 * Handles keyboard viewport resizing, scroll-into-view, and fixed-element overlap.
 */
export function useMobileKeyboardFocus(bottomOffset = 96) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const viewport = window.visualViewport;
    const doc = document.documentElement;

    const scrollActiveIntoView = () => {
      const active = document.activeElement;
      if (!isEditable(active)) return;

      const rect = active.getBoundingClientRect();
      const visibleHeight = viewport ? viewport.height : window.innerHeight;
      const bottomLimit = visibleHeight - bottomOffset;

      if (rect.bottom > bottomLimit || rect.top < 8) {
        active.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };

    const handleViewportChange = () => {
      if (!viewport) return;
      const keyboardOpen = viewport.height < window.innerHeight * 0.85;
      doc.style.setProperty('--keyboard-inset', keyboardOpen ? `${bottomOffset}px` : '0px');
      doc.style.setProperty('--viewport-height', `${viewport.height}px`);
      if (keyboardOpen) scrollActiveIntoView();
    };

    const handleFocusIn = (event) => {
      if (!isEditable(event.target)) return;
      window.requestAnimationFrame(scrollActiveIntoView);
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    document.addEventListener('focusin', handleFocusIn);
    if (viewport) viewport.addEventListener('resize', handleViewportChange);

    handleViewportChange();

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      document.removeEventListener('focusin', handleFocusIn);
      if (viewport) viewport.removeEventListener('resize', handleViewportChange);
      doc.style.removeProperty('--keyboard-inset');
      doc.style.removeProperty('--viewport-height');
    };
  }, [bottomOffset]);
}

export default useMobileKeyboardFocus;
