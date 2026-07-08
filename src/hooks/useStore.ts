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
  const actionRef = useRef(action);
  actionRef.current = action;

  return useCallback(
    (...args: A) =>
      YujiRuntime.runPromise(
        actionRef.current(...args).pipe(
          Effect.catchAllCause((cause) => {
            if (Cause.isInterruptedOnly(cause)) return Effect.void;
            return reportError(errorPrefix, cause);
          }),
        ),
      ),
    [errorPrefix],
  );
};

export const useStoreAction = <A extends unknown[], Success, Error, Requirements extends YujiEnv>(
  action: (s: StoreService, ...args: A) => Effect.Effect<Success, Error, Requirements>,
) => {
  const actionRef = useRef(action);
  actionRef.current = action;

  return useCallback(
    (...args: A) =>
      YujiRuntime.runPromise(
        Effect.flatMap(StoreService, (s) =>
          actionRef.current(s, ...args).pipe(
            Effect.catchAllCause((cause) => {
              if (Cause.isInterruptedOnly(cause)) return Effect.void;
              return reportError('Store action failed', cause);
            }),
          ),
        ),
      ),
    [],
  );
};

export const useChatAction = <A extends unknown[], Success, Error, Requirements extends YujiEnv>(
  action: (c: ChatService, ...args: A) => Effect.Effect<Success, Error, Requirements>,
) => {
  const actionRef = useRef(action);
  actionRef.current = action;

  return useCallback(
    (...args: A) =>
      YujiRuntime.runPromise(
        Effect.flatMap(ChatService, (c) =>
          actionRef.current(c, ...args).pipe(
            Effect.catchAllCause((cause) => {
              if (Cause.isInterruptedOnly(cause)) return Effect.void;
              return reportError('Chat action failed', cause);
            }),
          ),
        ),
      ),
    [],
  );
};
