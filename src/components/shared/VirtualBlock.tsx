import React, { useLayoutEffect, useRef, useState } from 'react';

interface VirtualBlockProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * VirtualBlock leverages CSS 'content-visibility: auto' for virtualization.
 * This native browser feature automatically skips rendering for elements
 * that are outside the viewport while maintaining scroll position and
 * accessible document structure.
 */
export const VirtualBlock: React.FC<VirtualBlockProps> = ({ children, className }) => {
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
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
};
