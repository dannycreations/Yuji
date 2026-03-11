import { useEffect } from 'react';

import type { RefObject } from 'react';

export const useClickOutside = <T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
  ignoreRef?: RefObject<HTMLElement | null>,
) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref?.current;
      const target = event?.target as Node | null;

      if (!el || el.contains(target)) return;
      if (ignoreRef?.current?.contains(target)) return;

      if (!(target instanceof Element)) {
        handler(event);
        return;
      }

      // Handle clicks in portaled elements (modals, dropdowns, etc.)
      // If the click is inside a portal that follows our element in the DOM (like a newer modal or dropdown),
      // we ignore it to prevent closing underlying elements.
      const targetPortal = target.closest('.modal-container, .dropdown-menu');
      if (targetPortal && targetPortal !== el && el.compareDocumentPosition(targetPortal) & Node.DOCUMENT_POSITION_FOLLOWING) {
        return;
      }

      const targetOverlay = target.closest('.modal-overlay');
      const myOverlay = el.closest('.modal-overlay');
      if (
        targetOverlay &&
        myOverlay &&
        targetOverlay !== myOverlay &&
        myOverlay.compareDocumentPosition(targetOverlay) & Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        return;
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
