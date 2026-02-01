import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import { YujiRuntime } from '../app/Yuji';
import { StoreService } from '../services/StoreService';

import type { AppState } from '../app/Schema';

export const useStore = <T>(selector: (state: AppState) => T, initialValue?: T): T => {
  const [state, setState] = useState(initialValue as T);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  useEffect(() => {
    let active = true;
    const fiber = YujiRuntime.runFork(
      Effect.gen(function* () {
        const store = yield* StoreService;
        const initialState = yield* SubscriptionRef.get(store.state);
        if (active) {
          setState(selectorRef.current(initialState));
        }

        yield* store.state.changes.pipe(
          Stream.runForEach((s) =>
            Effect.sync(() => {
              if (active) {
                setState(selectorRef.current(s));
              }
            }),
          ),
        );
      }),
    );

    return () => {
      active = false;
      YujiRuntime.runFork(Fiber.interrupt(fiber));
    };
  }, []);

  return state;
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
