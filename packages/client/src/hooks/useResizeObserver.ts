import { useEffect, useRef, useState } from 'react';

import type { RefObject } from 'react';

export const useResizeObserver = (ref: RefObject<HTMLElement | null>): number => {
  const [height, setHeight] = useState(0);
  const frameId = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setHeight(0);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      if (frameId.current !== null) return;

      frameId.current = requestAnimationFrame(() => {
        const entry = entries[0];
        if (entry) {
          setHeight(entry.contentRect.height);
        }
        frameId.current = null;
      });
    });

    observer.observe(el);
    return () => {
      if (frameId.current !== null) {
        cancelAnimationFrame(frameId.current);
      }
      observer.disconnect();
    };
  }, [ref]);

  return height;
};
