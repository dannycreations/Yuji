import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { createContext, useContext, useMemo, useRef, useSyncExternalStore } from 'react';

import { YujiRuntime } from '../app/Yuji';
import { StoreService } from '../services/StoreService';

import type { AppState } from '../app/Schema';

export const StoreContext = createContext<StoreService | null>(null);

export const useStore = <T>(selector: (state: AppState) => T, initialValue?: T): T => {
  const storeService = useContext(StoreContext);
  const lastSnapshotRef = useRef<T>(initialValue as T);
  const lastStateRef = useRef<AppState | null>(null);

  const subscribe = useMemo(() => {
    if (!storeService) return () => () => {};
    return (callback: () => void) => {
      const fiber = YujiRuntime.runFork(
        Stream.runForEach(storeService.state.changes, () =>
          Effect.sync(() => {
            callback();
          }),
        ),
      );
      return () => {
        YujiRuntime.runFork(Fiber.interrupt(fiber));
      };
    };
  }, [storeService]);

  const getSnapshot = () => {
    if (!storeService) return initialValue as T;
    const state = YujiRuntime.runSync(SubscriptionRef.get(storeService.state));

    if (state === lastStateRef.current) {
      return lastSnapshotRef.current;
    }

    const nextSnapshot = selector(state);
    lastStateRef.current = state;
    lastSnapshotRef.current = nextSnapshot;
    return nextSnapshot;
  };

  const getServerSnapshot = () => initialValue as T;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};

export const useAction = <A extends unknown[], R, E>(effectFn: (...args: A) => Effect.Effect<R, E, any>) => {
  const effectFnRef = useRef(effectFn);
  effectFnRef.current = effectFn;

  return useMemo(
    () =>
      (...args: A) =>
        YujiRuntime.runPromise(
          effectFnRef.current(...args).pipe(
            Effect.catchAll((err) =>
              Effect.gen(function* () {
                const store = yield* StoreService;
                const message = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
                yield* store.notify('error', message);
              }),
            ),
          ),
        ),
    [],
  );
};

export const useUpdateStore = () => {
  return useAction((f: (state: AppState) => AppState) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      return yield* store.update(f);
    }),
  );
};
