import { useLayoutEffect, useRef, useState } from 'react';

import type { CSSProperties, FC, ReactNode } from 'react';

interface VirtualBlockProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * VirtualBlock leverages CSS 'content-visibility: auto' for virtualization.
 * This native browser feature automatically skips rendering for elements
 * that are outside the viewport while maintaining scroll position and
 * accessible document structure.
 */
export const VirtualBlock: FC<VirtualBlockProps> = ({ children, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [intrinsicHeight, setIntrinsicHeight] = useState<number>(100);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (height > 0) {
          setIntrinsicHeight(height);
        }
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={
        {
          contentVisibility: 'auto',
          containIntrinsicSize: `auto ${intrinsicHeight}px`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
};
