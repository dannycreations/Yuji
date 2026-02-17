import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseVirtualListOptions<T> {
  readonly containerHeight: number;
  readonly estimatedItemHeight: number;
  readonly items: ReadonlyArray<T>;
  readonly getItemKey: (item: T) => string;
  readonly overscan?: number;
}

export const useVirtualList = <T>({ containerHeight, estimatedItemHeight, items, getItemKey, overscan = 5 }: UseVirtualListOptions<T>) => {
  const [heights, setHeights] = useState<Map<string, number>>(() => new Map());
  const [range, setRange] = useState({ startIndex: 0, endIndex: 0 });

  const scrollTopRef = useRef(0);
  const pendingHeightsRef = useRef<Map<string, number>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

  const totalCount = items.length;

  const setItemHeight = useCallback((key: string, height: number) => {
    // Check if the height actually changed before scheduling an update
    // This optimization prevents redundant RAFs and re-renders
    const currentHeight = pendingHeightsRef.current.get(key);
    if (currentHeight !== undefined && Math.abs(currentHeight - height) < 0.5) return;

    pendingHeightsRef.current.set(key, height);

    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        setHeights((prev) => {
          const next = new Map(prev);
          let changed = false;
          for (const [k, h] of pendingHeightsRef.current) {
            if (Math.abs((next.get(k) ?? 0) - h) >= 0.5) {
              next.set(k, h);
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

  const clearItemHeights = useCallback(() => {
    setHeights(new Map());
    pendingHeightsRef.current.clear();
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Use ResizeObserver for smart, reactive height tracking
  const observerRef = useRef<ResizeObserver | null>(null);

  // Keep track of observed elements to handle unmounting/cleanup
  const observedElementsRef = useRef<Set<HTMLElement>>(new Set());

  const measureElement = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;

      if (!observerRef.current) {
        observerRef.current = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const key = (entry.target as HTMLElement).getAttribute('data-vkey');
            if (key) {
              const height = entry.contentRect.height;
              setItemHeight(key, height);
            }
          }
        });
      }

      if (!observedElementsRef.current.has(el)) {
        observerRef.current.observe(el);
        observedElementsRef.current.add(el);
      }
    },
    [setItemHeight],
  );

  // Cleanup Map to prevent memory leaks as items are deleted or the thread is switched
  useEffect(() => {
    const itemKeys = new Set(items.map(getItemKey));
    setHeights((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (!itemKeys.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items, getItemKey]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observedElementsRef.current.clear();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const fenwick = useMemo(() => {
    const tree = new Float64Array(totalCount + 1);
    const getInitialValue = (i: number) => {
      const item = items[i];
      if (!item) return estimatedItemHeight;
      const key = getItemKey(item);
      return heights.get(key) ?? estimatedItemHeight;
    };

    for (let i = 1; i <= totalCount; i++) {
      tree[i] += getInitialValue(i - 1);
      const j = i + (i & -i);
      if (j <= totalCount) tree[j] += tree[i];
    }
    return tree;
  }, [totalCount, items, getItemKey, heights, estimatedItemHeight]);

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
      // Use a fallback height when containerHeight is 0 (e.g. initial render or hidden)
      // to ensure a reasonable number of items are rendered to avoid a "flash" of empty list
      // when the component first appears.
      const effectiveHeight = containerHeight > 0 ? containerHeight : 1000;
      const endIdx = findIndex(scrollTop + effectiveHeight);

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
    // If containerHeight is 0, we might have been hidden.
    // Resetting scroll top to 0 ensures we don't get stuck in a weird state when shown again.
    const st = containerHeight === 0 ? 0 : scrollTopRef.current;
    if (containerHeight === 0) scrollTopRef.current = 0;

    const nextRange = computeRange(st);
    if (nextRange.startIndex !== range.startIndex || nextRange.endIndex !== range.endIndex) {
      setRange(nextRange);
    }
  }, [computeRange, containerHeight]);

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
    measureElement,
    clearItemHeights,
  };
};
