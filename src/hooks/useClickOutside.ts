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
        // If click is on ANY overlay or container that is NOT our container
        // and that container/overlay belongs to a modal logically after/on-top of ours
        const modalContainers = Array.from(document.querySelectorAll('.modal-container'));
        const myIndex = modalContainers.indexOf(el);
        const targetContainer = target.closest('.modal-container');

        if (targetContainer) {
          const targetIndex = modalContainers.indexOf(targetContainer);
          // If the click is in a container that comes AFTER ours in the DOM,
          // it's a stacked modal, so don't close the current one.
          if (targetIndex > myIndex) return;
        }

        // Also check if the click was on a modal-overlay that is for a later modal
        const targetOverlay = target.closest('.modal-overlay');
        if (targetOverlay) {
          const overlays = Array.from(document.querySelectorAll('.modal-overlay'));
          const myOverlay = el.closest('.modal-overlay');
          if (myOverlay) {
            const myOverlayIndex = overlays.indexOf(myOverlay);
            const targetOverlayIndex = overlays.indexOf(targetOverlay);
            if (targetOverlayIndex > myOverlayIndex) return;
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
