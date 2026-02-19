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
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);

  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  const subscribe = useMemo(() => {
    return (callback: () => void) => {
      return store.subscribe(() => {
        const nextSelectedState = selectorRef.current(store.getSnapshot());
        const changed = !isEqualRef.current(lastSelectedState.current, nextSelectedState);

        if (changed) {
          callback();
        }
      });
    };
  }, [store]);

  const getSnapshot = useCallback(() => {
    const nextSelectedState = selectorRef.current(store.getSnapshot());
    lastSelectedState.current = nextSelectedState;
    return nextSelectedState;
  }, [store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useStoreAction = <A extends unknown[], R, E, I extends ManagedRuntime.ManagedRuntime.Context<typeof YujiRuntime>>(
  action: (s: StoreService, ...args: A) => Effect.Effect<R, E, I>,
) => {
  const store = useStoreService();
  const actionRef = useRef(action);
  actionRef.current = action;
  return useCallback((...args: A) => YujiRuntime.runPromise(actionRef.current(store, ...args)), [store]);
};

export const useChatAction = <A extends unknown[], R, E, I extends ManagedRuntime.ManagedRuntime.Context<typeof YujiRuntime>>(
  action: (c: ChatService, ...args: A) => Effect.Effect<R, E, I>,
) => {
  const actionRef = useRef(action);
  actionRef.current = action;
  return useCallback((...args: A) => YujiRuntime.runPromise(Effect.flatMap(ChatService, (c) => actionRef.current(c, ...args))), []);
};
