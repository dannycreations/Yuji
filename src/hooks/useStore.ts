import { Effect } from 'effect';
import { createContext, useContext, useMemo, useRef, useSyncExternalStore } from 'react';

import { YujiRuntime } from '../app/Runtime';
import { StoreService } from '../services/StoreService';
import { formatError } from '../utilities/CommonUtil';

import type { AppRuntimeState } from '../app/Schema';

export const StoreContext = createContext<StoreService | null>(null);

export const useStoreService = (): StoreService => {
  const service = useContext(StoreContext);
  if (!service) {
    throw new Error('StoreContext not found');
  }
  return service;
};

export const useStore = <T>(selector: (state: AppRuntimeState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T => {
  const storeService = useStoreService();
  const lastSelectedState = useRef<T | null>(null);

  const subscribe = useMemo(() => {
    return (callback: () => void) => {
      return storeService.subscribe(() => {
        const nextSelectedState = selector(storeService.getSnapshot());
        const changed = isEqual ? !isEqual(lastSelectedState.current as T, nextSelectedState) : nextSelectedState !== lastSelectedState.current;

        if (changed) {
          callback();
        }
      });
    };
  }, [storeService, selector, isEqual]);

  const getSnapshot = () => {
    const nextSelectedState = selector(storeService.getSnapshot());
    lastSelectedState.current = nextSelectedState;
    return nextSelectedState;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useStoreEffect = <A extends unknown[], R, E, I>(effectFn: (...args: A) => Effect.Effect<R, E, I>) => {
  const effectFnRef = useRef(effectFn);
  effectFnRef.current = effectFn;

  return useMemo(
    () =>
      (...args: A): Promise<R | null> =>
        YujiRuntime.runPromise(
          Effect.flatMap(StoreService, (store) =>
            effectFnRef.current(...args).pipe(
              Effect.catchAll((err) => store.notify('error', formatError(err)).pipe(Effect.as(null))),
              Effect.orDie,
            ),
          ) as unknown as Effect.Effect<R | null, never, never>,
        ),
    [],
  );
};

export const useStoreAction = <A extends unknown[], R, E, I>(effectFn: (service: StoreService, ...args: A) => Effect.Effect<R, E, I>) => {
  return useStoreEffect((...args: A) => Effect.flatMap(StoreService, (s) => effectFn(s, ...args)));
};
