import { Effect, ManagedRuntime } from 'effect';
import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react';

import { YujiRuntime } from '../app/Runtime';
import { ChatService } from '../services/ChatService';
import { StoreService } from '../services/StoreService';

import type { AppRuntimeState } from '../app/Schema';

export const StoreContext = createContext<StoreService | null>(null);

const useStoreService = (): StoreService => {
  const service = useContext(StoreContext);
  if (!service) {
    throw new Error('StoreContext not found');
  }
  return service;
};

export const useStore = <T>(selector: (state: AppRuntimeState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T => {
  const store = useStoreService();
  const lastSelectedState = useRef<T>(null as unknown as T);

  const subscribe = useMemo(() => {
    return (callback: () => void) => {
      return store.subscribe(() => {
        const nextSelectedState = selector(store.getSnapshot());
        const changed = !isEqual(lastSelectedState.current, nextSelectedState);

        if (changed) {
          callback();
        }
      });
    };
  }, [store, selector, isEqual]);

  const getSnapshot = () => {
    const nextSelectedState = selector(store.getSnapshot());
    lastSelectedState.current = nextSelectedState;
    return nextSelectedState;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useStoreAction = <A extends unknown[], R, E, I extends ManagedRuntime.ManagedRuntime.Context<typeof YujiRuntime>>(
  action: (s: StoreService, ...args: A) => Effect.Effect<R, E, I>,
) => {
  const store = useStoreService();
  return useCallback((...args: A) => YujiRuntime.runPromise(action(store, ...args)), [store, action]);
};

export const useChatAction = <A extends unknown[], R, E, I extends ManagedRuntime.ManagedRuntime.Context<typeof YujiRuntime>>(
  action: (c: ChatService, ...args: A) => Effect.Effect<R, E, I>,
) => {
  return useCallback((...args: A) => YujiRuntime.runPromise(Effect.flatMap(ChatService, (c) => action(c, ...args))), [action]);
};
