import { Cause, Effect } from 'effect';
import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';

import { reportError } from '../app/Error';
import { YujiEnv, YujiRuntime } from '../app/Runtime';
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

const useStableCallback = <A extends unknown[], R>(callback: (...args: A) => R) => {
  const ref = useRef(callback);
  ref.current = callback;

  return useCallback((...args: A) => ref.current(...args), []);
};

const runReported = <Success, Error, Requirements extends YujiEnv>(errorPrefix: string, effect: Effect.Effect<Success, Error, Requirements>) =>
  YujiRuntime.runPromise(
    effect.pipe(
      Effect.catchAllCause((cause) => {
        if (Cause.isInterruptedOnly(cause)) return Effect.void;
        return reportError(errorPrefix, cause);
      }),
    ),
  );

export const useStore = <T>(selector: (state: AppRuntimeState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T => {
  const store = useStoreService();

  const getSnapshot = useCallback(() => selector(store.getSnapshot()), [store, selector]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let lastValue: T;
      try {
        lastValue = getSnapshot();
      } catch {
        // Fallback for edge cases during hydration/unmount
        return store.subscribe(onStoreChange);
      }

      return store.subscribe(() => {
        const nextValue = getSnapshot();
        if (!isEqual(lastValue, nextValue)) {
          lastValue = nextValue;
          onStoreChange();
        }
      });
    },
    [store, getSnapshot, isEqual],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useRuntimeAction = <A extends unknown[], Success, Error, Requirements extends YujiEnv>(
  action: (...args: A) => Effect.Effect<Success, Error, Requirements>,
  errorPrefix = 'Action failed',
) => {
  const stableAction = useStableCallback(action);

  return useCallback((...args: A) => runReported(errorPrefix, stableAction(...args)), [stableAction, errorPrefix]);
};

export const useStoreAction = <A extends unknown[], Success, Error, Requirements extends YujiEnv>(
  action: (s: StoreService, ...args: A) => Effect.Effect<Success, Error, Requirements>,
) => {
  const stableAction = useStableCallback(action);

  return useCallback(
    (...args: A) =>
      runReported(
        'Store action failed',
        Effect.flatMap(StoreService, (s) => stableAction(s, ...args)),
      ),
    [stableAction],
  );
};

export const useChatAction = <A extends unknown[], Success, Error, Requirements extends YujiEnv>(
  action: (c: ChatService, ...args: A) => Effect.Effect<Success, Error, Requirements>,
) => {
  const stableAction = useStableCallback(action);

  return useCallback(
    (...args: A) =>
      runReported(
        'Chat action failed',
        Effect.flatMap(ChatService, (c) => stableAction(c, ...args)),
      ),
    [stableAction],
  );
};
