import { useCallback, useMemo, useState } from 'react';

interface UseVirtualListOptions {
  readonly containerHeight: number;
  readonly itemHeight: number;
  readonly totalCount: number;
  readonly overscan?: number;
}

export const useVirtualList = ({
  containerHeight,
  itemHeight,
  totalCount,
  overscan = 5,
}: UseVirtualListOptions) => {
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { startIndex, endIndex, translateY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(
      totalCount,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
    );

    return {
      startIndex: start,
      endIndex: end,
      translateY: start * itemHeight,
    };
  }, [scrollTop, itemHeight, containerHeight, totalCount, overscan]);

  const totalHeight = totalCount * itemHeight;

  return {
    startIndex,
    endIndex,
    translateY,
    totalHeight,
    onScroll,
  };
};