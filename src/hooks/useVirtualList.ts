import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseVirtualListOptions<T> {
  readonly containerHeight: number;
  readonly estimatedItemHeight: number;
  readonly items: ReadonlyArray<T>;
  readonly getItemKey: (item: T) => string;
  readonly overscan?: number;
}

export const useVirtualList = <T>({ containerHeight, estimatedItemHeight, items, getItemKey, overscan = 5 }: UseVirtualListOptions<T>) => {
  const [range, setRange] = useState({ startIndex: 0, endIndex: 0 });

  const scrollTopRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  const totalCount = items.length;

  // We maintain the Fenwick tree and individual heights in refs to allow O(log N) updates
  // without re-rendering the entire component until the scroll range actually changes.
  const fenwickRef = useRef<Float64Array>(new Float64Array(0));
  const heightsRef = useRef<Map<string, number>>(new Map());
  const itemKeysRef = useRef<string[]>([]);
  const keyToIndexMapRef = useRef<Map<string, number>>(new Map());
  const pendingUpdatesRef = useRef<Map<string, number>>(new Map());

  // Initialize/Rebuild tree when items change
  useMemo(() => {
    const newKeys = items.map(getItemKey);
    const newCount = newKeys.length;
    const tree = new Float64Array(newCount + 1);
    const newKeyToIndexMap = new Map<string, number>();

    const getInitialValue = (i: number) => {
      const key = newKeys[i];
      newKeyToIndexMap.set(key, i);
      return heightsRef.current.get(key) ?? estimatedItemHeight;
    };

    for (let i = 1; i <= newCount; i++) {
      tree[i] += getInitialValue(i - 1);
      const j = i + (i & -i);
      if (j <= newCount) tree[j] += tree[i];
    }

    fenwickRef.current = tree;
    itemKeysRef.current = newKeys;
    keyToIndexMapRef.current = newKeyToIndexMap;

    // Cleanup heights map to prevent memory leaks
    const keySet = new Set(newKeys);
    for (const key of heightsRef.current.keys()) {
      if (!keySet.has(key)) {
        heightsRef.current.delete(key);
      }
    }
  }, [items, getItemKey, estimatedItemHeight]);

  const getPrefixSum = useCallback((index: number) => {
    let sum = 0;
    let i = index;
    const tree = fenwickRef.current;
    while (i > 0) {
      sum += tree[i];
      i -= i & -i;
    }
    return sum;
  }, []);

  const findIndex = useCallback((target: number) => {
    let idx = 0;
    let currentSum = 0;
    const tree = fenwickRef.current;
    const n = tree.length - 1;
    if (n <= 0) return 0;

    const bitLength = Math.floor(Math.log2(n)) + 1;

    for (let i = 1 << (bitLength - 1); i > 0; i >>= 1) {
      const nextIdx = idx + i;
      if (nextIdx <= n && currentSum + tree[nextIdx] <= target) {
        idx = nextIdx;
        currentSum += tree[idx];
      }
    }
    return idx;
  }, []);

  const updateFenwick = useCallback((index: number, delta: number) => {
    let i = index + 1;
    const tree = fenwickRef.current;
    const n = tree.length - 1;
    while (i <= n) {
      tree[i] += delta;
      i += i & -i;
    }
  }, []);

  const setItemHeight = useCallback(
    (key: string, height: number) => {
      const currentHeight = heightsRef.current.get(key) ?? estimatedItemHeight;
      // Only update if change is significant (> 1px) to reduce thrashing during stream
      if (Math.abs(currentHeight - height) < 1) return;

      pendingUpdatesRef.current.set(key, height);

      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(() => {
          let needsRangeUpdate = false;

          for (const [k, h] of pendingUpdatesRef.current) {
            const oldH = heightsRef.current.get(k) ?? estimatedItemHeight;
            const delta = h - oldH;

            if (Math.abs(delta) >= 1) {
              heightsRef.current.set(k, h);
              const idx = keyToIndexMapRef.current.get(k);
              if (idx !== undefined) {
                updateFenwick(idx, delta);
                needsRangeUpdate = true;
              }
            }
          }

          pendingUpdatesRef.current.clear();
          animationFrameRef.current = null;

          if (needsRangeUpdate) {
            const nextRange = computeRange(scrollTopRef.current);
            if (nextRange.startIndex !== range.startIndex || nextRange.endIndex !== range.endIndex) {
              setRange(nextRange);
            }
          }
        });
      }
    },
    [estimatedItemHeight, updateFenwick, range.startIndex, range.endIndex],
  );

  const clearItemHeights = useCallback(() => {
    heightsRef.current.clear();
    pendingUpdatesRef.current.clear();
    // Resetting the tree to estimated heights
    const n = itemKeysRef.current.length;
    const tree = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) {
      tree[i] += estimatedItemHeight;
      const j = i + (i & -i);
      if (j <= n) tree[j] += tree[i];
    }
    fenwickRef.current = tree;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [estimatedItemHeight]);

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

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observedElementsRef.current.clear();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

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
