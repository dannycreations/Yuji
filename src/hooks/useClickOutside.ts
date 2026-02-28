import { useEffect } from 'react';

import type { RefObject } from 'react';

/**
 * Hook that triggers a handler when a click or touch event occurs outside of the passed ref.
 */
export const useClickOutside = <T extends HTMLElement = HTMLElement>(ref: RefObject<T | null>, handler: (event: MouseEvent | TouchEvent) => void) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref?.current;
      const target = event?.target as Node | null;
      if (!el || el.contains(target)) return;

      // All modals have a .modal-overlay and a .modal-container child.
      // If the click is inside a modal-overlay but outside OUR container,
      // it might be a click on a different modal (like a ConfirmModal on top).
      if (target instanceof Element) {
        const targetContainer = target.closest('.modal-container');
        if (targetContainer && targetContainer !== el) {
          // If target is AFTER el in DOM, it's a stacked modal.
          if (el.compareDocumentPosition(targetContainer) & Node.DOCUMENT_POSITION_FOLLOWING) {
            return;
          }
        }

        const targetOverlay = target.closest('.modal-overlay');
        if (targetOverlay) {
          const myOverlay = el.closest('.modal-overlay');
          if (myOverlay && targetOverlay !== myOverlay) {
            if (myOverlay.compareDocumentPosition(targetOverlay) & Node.DOCUMENT_POSITION_FOLLOWING) {
              return;
            }
          }
        }
      }

      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
};
