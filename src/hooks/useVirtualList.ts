import { useCallback, useMemo, useRef, useState } from 'react';

interface UseVirtualListOptions {
  readonly containerHeight: number;
  readonly estimatedItemHeight: number;
  readonly totalCount: number;
  readonly overscan?: number;
}

export const useVirtualList = ({ containerHeight, estimatedItemHeight, totalCount, overscan = 5 }: UseVirtualListOptions) => {
  const [heights, setHeights] = useState<Record<number, number>>({});
  const [range, setRange] = useState({ startIndex: 0, endIndex: 0 });

  const scrollTopRef = useRef(0);
  const pendingHeightsRef = useRef<Record<number, number>>({});
  const animationFrameRef = useRef<number | null>(null);

  const setItemHeight = useCallback((index: number, height: number) => {
    pendingHeightsRef.current[index] = height;

    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        setHeights((prev) => {
          const next = { ...prev };
          let changed = false;
          const entries = Object.entries(pendingHeightsRef.current);
          for (let i = 0; i < entries.length; i++) {
            const [idx, h] = entries[i];
            const index = Number(idx);
            if (next[index] !== h) {
              next[index] = h;
              changed = true;
            }
          }
          pendingHeightsRef.current = {};
          animationFrameRef.current = null;
          return changed ? next : prev;
        });
      });
    }
  }, []);

  const clearItemHeight = useCallback((index: number) => {
    setHeights((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  const clearItemHeights = useCallback(() => {
    setHeights({});
    pendingHeightsRef.current = {};
  }, []);

  const prefixSums = useMemo(() => {
    const sums = new Float64Array(totalCount + 1);
    for (let i = 0; i < totalCount; i++) {
      sums[i + 1] = sums[i] + (heights[i] ?? estimatedItemHeight);
    }
    return sums;
  }, [totalCount, heights, estimatedItemHeight]);

  const findIndex = useCallback(
    (target: number) => {
      let low = 0;
      let high = totalCount;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (prefixSums[mid + 1] <= target) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      return low;
    },
    [prefixSums, totalCount],
  );

  const computeRange = useCallback(
    (scrollTop: number) => {
      if (totalCount === 0) return { startIndex: 0, endIndex: 0 };

      const startIdx = findIndex(scrollTop);
      const endIdx = findIndex(scrollTop + containerHeight);

      return {
        startIndex: Math.max(0, startIdx - overscan),
        endIndex: Math.min(totalCount, endIdx + overscan),
      };
    },
    [containerHeight, findIndex, overscan, totalCount],
  );

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const nextScrollTop = e.currentTarget.scrollTop;
      scrollTopRef.current = nextScrollTop;

      const nextRange = computeRange(nextScrollTop);
      if (nextRange.startIndex !== range.startIndex || nextRange.endIndex !== range.endIndex) {
        setRange(nextRange);
      }
    },
    [computeRange, range.endIndex, range.startIndex],
  );

  // Sync range when totalCount or heights change
  useMemo(() => {
    const nextRange = computeRange(scrollTopRef.current);
    if (nextRange.startIndex !== range.startIndex || nextRange.endIndex !== range.endIndex) {
      setRange(nextRange);
    }
  }, [computeRange]);

  const { startIndex, endIndex, translateY, totalHeight } = useMemo(() => {
    return {
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      translateY: prefixSums[range.startIndex] || 0,
      totalHeight: prefixSums[totalCount] || 0,
    };
  }, [range.startIndex, range.endIndex, prefixSums, totalCount]);

  return {
    startIndex,
    endIndex,
    translateY,
    totalHeight,
    onScroll,
    setItemHeight,
    clearItemHeight,
    clearItemHeights,
  };
};
