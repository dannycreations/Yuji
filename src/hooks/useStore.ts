import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AppState } from '../app/Schema';
import { YujiRuntime } from '../app/Yuji';
import { StoreService } from '../services/StoreService';

export const useStore = <T>(selector: (state: AppState) => T, initialValue?: T): T => {
  const [state, setState] = useState<T>(initialValue as any);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  useEffect(() => {
    const fiber = YujiRuntime.runFork(
      Effect.gen(function* () {
        const store = yield* StoreService;
        const initialState = yield* SubscriptionRef.get(store.state);
        setState(selectorRef.current(initialState));

        yield* store.state.changes.pipe(
          Stream.runForEach((s) =>
            Effect.sync(() => {
              setState(selectorRef.current(s));
            }),
          ),
        );
      }),
    );

    return () => {
      YujiRuntime.runFork(Fiber.interrupt(fiber));
    };
  }, []);

  return state;
};

export const useAction = <A extends any[], R, E>(effectFn: (...args: A) => Effect.Effect<R, E, any>) => {
  return useMemo(
    () =>
      (...args: A) =>
        YujiRuntime.runPromise(effectFn(...args)),
    [effectFn],
  );
};
