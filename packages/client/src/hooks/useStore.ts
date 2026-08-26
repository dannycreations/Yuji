import { Cause, Context, Effect } from 'effect';
import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';

import { reportError } from '@yuji/client/app/Error';
import { YujiRuntime } from '@yuji/client/app/Runtime';
import { ChatService } from '@yuji/client/services/ChatService';
import { StoreService } from '@yuji/client/services/StoreService';

import type { YujiEnv } from '@yuji/client/app/Runtime';
import type { AppRuntimeState } from '@yuji/client/app/Schema';

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

const makeServiceAction =
  <S extends YujiEnv>(tag: Context.Tag<S, S>, errorPrefix: string) =>
  <A extends unknown[], Success, Error, Requirements extends YujiEnv>(
    action: (service: S, ...args: A) => Effect.Effect<Success, Error, Requirements>,
  ) => {
    const stableAction = useStableCallback(action);

    return useCallback(
      (...args: A) =>
        runReported(
          errorPrefix,
          Effect.flatMap(tag, (service) => stableAction(service, ...args)),
        ),
      [stableAction],
    );
  };

export const useStoreAction = makeServiceAction(StoreService, 'Store action failed');
export const useChatAction = makeServiceAction(ChatService, 'Chat action failed');
