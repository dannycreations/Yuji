import { useEffect, useState } from 'react';

import type { RefObject } from 'react';

export const useResizeObserver = (ref: RefObject<HTMLElement | null>) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setDimensions({ width: 0, height: 0 });
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref, ref.current]);

  return dimensions;
};
