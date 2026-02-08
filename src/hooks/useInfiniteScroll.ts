import { useCallback, useRef } from 'react';

interface InfiniteScrollOptions {
  readonly onLoadMore: () => Promise<void> | void;
  readonly threshold?: number;
  readonly isLoading?: boolean;
  readonly direction?: 'top' | 'bottom';
  readonly enabled?: boolean;
}

export const useInfiniteScroll = ({ onLoadMore, threshold = 20, isLoading = false, direction = 'bottom', enabled = true }: InfiniteScrollOptions) => {
  const isHandlingRef = useRef(false);

  const handleScroll = useCallback(
    async (e: React.UIEvent<HTMLElement>) => {
      if (!enabled || isLoading || isHandlingRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

      const isNearEdge = direction === 'bottom' ? scrollHeight - scrollTop <= clientHeight + threshold : scrollTop <= threshold;

      if (isNearEdge) {
        isHandlingRef.current = true;
        try {
          await onLoadMore();
        } finally {
          isHandlingRef.current = false;
        }
      }
    },
    [enabled, isLoading, direction, threshold, onLoadMore],
  );

  return { handleScroll };
};
