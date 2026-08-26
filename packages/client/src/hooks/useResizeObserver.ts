import { useEffect, useRef, useState } from 'react';

import type { RefObject } from 'react';

export const useResizeObserver = (ref: RefObject<HTMLElement | null>) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const frameId = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setDimensions({ width: 0, height: 0 });
      return;
    }

    const observer = new ResizeObserver((entries) => {
      if (frameId.current !== null) return;

      frameId.current = requestAnimationFrame(() => {
        const entry = entries[0];
        if (entry) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
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

  return dimensions;
};
