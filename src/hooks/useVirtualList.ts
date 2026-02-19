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
    const len = items.length;
    const newKeys = new Array<string>(len);
    const newCount = len;
    const tree = new Float64Array(newCount + 1);
    const newKeyToIndexMap = new Map<string, number>();

    for (let i = 0; i < len; i++) {
      const key = getItemKey(items[i]);
      newKeys[i] = key;
      newKeyToIndexMap.set(key, i);
      const h = heightsRef.current.get(key) ?? estimatedItemHeight;

      const treeIdx = i + 1;
      tree[treeIdx] += h;
      const j = treeIdx + (treeIdx & -treeIdx);
      if (j <= newCount) tree[j] += tree[treeIdx];
    }

    fenwickRef.current = tree;
    itemKeysRef.current = newKeys;
    keyToIndexMapRef.current = newKeyToIndexMap;

    // Cleanup heights map to prevent memory leaks
    if (heightsRef.current.size > len * 2 && len > 0) {
      const keySet = new Set(newKeys);
      const heights = heightsRef.current;
      for (const key of heights.keys()) {
        if (!keySet.has(key)) {
          heights.delete(key);
        }
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

    // Use 31 - Math.clz32(n) for faster floor(log2(n))
    const bitLength = 32 - Math.clz32(n);

    for (let i = 1 << (bitLength - 1); i > 0; i >>= 1) {
      const nextIdx = idx + i;
      if (nextIdx <= n) {
        const val = tree[nextIdx];
        if (currentSum + val <= target) {
          idx = nextIdx;
          currentSum += val;
        }
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

  const computeRange = useCallback(
    (scrollTop: number) => {
      if (totalCount === 0) return { startIndex: 0, endIndex: 0 };

      const startIdx = findIndex(scrollTop);
      // Use a fallback height when containerHeight is 0 (e.g. initial render or hidden)
      // to ensure a reasonable number of items are rendered to avoid a "flash" of empty list
      // when the component first appears.
      const effectiveHeight = containerHeight > 0 ? containerHeight : 1000;
      const endIdx = findIndex(scrollTop + effectiveHeight);

      const nextStart = Math.max(0, startIdx - overscan);
      const nextEnd = Math.min(totalCount, endIdx + overscan);

      return {
        startIndex: nextStart,
        endIndex: nextEnd,
      };
    },
    [containerHeight, findIndex, overscan, totalCount],
  );

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      // Clamp to non-negative values, preventing issues during "elastic" scrolling or momentum overscroll
      const nextScrollTop = Math.max(0, e.currentTarget.scrollTop);
      if (Math.abs(scrollTopRef.current - nextScrollTop) < 1) return;
      scrollTopRef.current = nextScrollTop;

      const nextRange = computeRange(nextScrollTop);
      setRange((prev) => {
        if (nextRange.startIndex !== prev.startIndex || nextRange.endIndex !== prev.endIndex) {
          return nextRange;
        }
        return prev;
      });
    },
    [computeRange],
  );

  const lastUpdateRef = useRef(0);
  const setItemHeight = useCallback(
    (key: string, height: number) => {
      const currentHeight = heightsRef.current.get(key) ?? estimatedItemHeight;
      if (Math.abs(currentHeight - height) < 1) return;

      pendingUpdatesRef.current.set(key, height);

      if (animationFrameRef.current === null) {
        const now = performance.now();
        // Wait at least 16ms (1 frame) or more if we are thrashing
        const delay = Math.max(0, 16 - (now - lastUpdateRef.current));

        const update = () => {
          animationFrameRef.current = requestAnimationFrame(() => {
            let needsRangeUpdate = false;
            lastUpdateRef.current = performance.now();

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
              setRange((prev) => {
                if (nextRange.startIndex !== prev.startIndex || nextRange.endIndex !== prev.endIndex) {
                  return nextRange;
                }
                return prev;
              });
            }
          });
        };

        if (delay > 0) {
          setTimeout(update, delay);
        } else {
          update();
        }
      }
    },
    [estimatedItemHeight, updateFenwick, computeRange],
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
          for (let i = 0, len = entries.length; i < len; i++) {
            const entry = entries[i];
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
