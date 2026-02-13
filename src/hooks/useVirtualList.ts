import { useCallback, useMemo, useRef, useState } from 'react';

interface UseVirtualListOptions {
  readonly containerHeight: number;
  readonly estimatedItemHeight: number;
  readonly totalCount: number;
  readonly overscan?: number;
}

export const useVirtualList = ({ containerHeight, estimatedItemHeight, totalCount, overscan = 5 }: UseVirtualListOptions) => {
  const [heights, setHeights] = useState<Map<number, number>>(() => new Map());
  const [range, setRange] = useState({ startIndex: 0, endIndex: 0 });

  const scrollTopRef = useRef(0);
  const pendingHeightsRef = useRef<Map<number, number>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

  const setItemHeight = useCallback((index: number, height: number) => {
    pendingHeightsRef.current.set(index, height);

    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        setHeights((prev) => {
          const next = new Map(prev);
          let changed = false;
          for (const [idx, h] of pendingHeightsRef.current) {
            if (next.get(idx) !== h) {
              next.set(idx, h);
              changed = true;
            }
          }
          pendingHeightsRef.current.clear();
          animationFrameRef.current = null;
          return changed ? next : prev;
        });
      });
    }
  }, []);

  const clearItemHeight = useCallback((index: number) => {
    setHeights((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Map(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const clearItemHeights = useCallback(() => {
    setHeights(new Map());
    pendingHeightsRef.current.clear();
  }, []);

  const fenwick = useMemo(() => {
    const tree = new Float64Array(totalCount + 1);
    const getInitialValue = (i: number) => heights.get(i) ?? estimatedItemHeight;

    for (let i = 1; i <= totalCount; i++) {
      tree[i] += getInitialValue(i - 1);
      const j = i + (i & -i);
      if (j <= totalCount) tree[j] += tree[i];
    }
    return tree;
  }, [totalCount, heights, estimatedItemHeight]);

  const getPrefixSum = useCallback(
    (index: number) => {
      let sum = 0;
      let i = index;
      while (i > 0) {
        sum += fenwick[i];
        i -= i & -i;
      }
      return sum;
    },
    [fenwick],
  );

  const findIndex = useCallback(
    (target: number) => {
      let idx = 0;
      let currentSum = 0;
      const bitLength = Math.floor(Math.log2(totalCount)) + 1;

      for (let i = 1 << (bitLength - 1); i > 0; i >>= 1) {
        const nextIdx = idx + i;
        if (nextIdx <= totalCount && currentSum + fenwick[nextIdx] <= target) {
          idx = nextIdx;
          currentSum += fenwick[idx];
        }
      }
      return idx;
    },
    [fenwick, totalCount],
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
      translateY: getPrefixSum(range.startIndex),
      totalHeight: getPrefixSum(totalCount),
    };
  }, [range.startIndex, range.endIndex, getPrefixSum, totalCount]);

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
