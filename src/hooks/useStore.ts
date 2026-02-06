import { Effect, Fiber, Stream } from 'effect';
import { createContext, useContext, useMemo, useRef, useSyncExternalStore } from 'react';

import { YujiRuntime } from '../app/Runtime';
import { StoreService } from '../services/StoreService';

import type { AppRuntimeState, ConfirmState } from '../app/Schema';

export const StoreContext = createContext<StoreService | null>(null);

export const useStoreService = (): StoreService => {
  const service = useContext(StoreContext);
  if (!service) {
    throw new Error('StoreContext not found');
  }
  return service;
};

export const useStore = <T>(selector: (state: AppRuntimeState) => T): T => {
  const storeService = useStoreService();

  const subscribe = useMemo(() => {
    return (callback: () => void) => {
      const fiber = YujiRuntime.runFork(Stream.runForEach(storeService.state.changes, () => Effect.sync(callback)));
      return () => {
        YujiRuntime.runFork(Fiber.interrupt(fiber));
      };
    };
  }, [storeService]);

  const getSnapshot = () => selector(storeService.getSnapshot());

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useStoreEffect = <A extends unknown[], R, E>(effectFn: (...args: A) => Effect.Effect<R, E, any>) => {
  const effectFnRef = useRef(effectFn);
  effectFnRef.current = effectFn;

  return useMemo(
    () =>
      (...args: A) =>
        YujiRuntime.runPromise(
          Effect.gen(function* () {
            const store = yield* StoreService;
            return yield* effectFnRef.current(...args).pipe(
              Effect.catchAll((err) => {
                const message = (err as { message: string })?.message || (typeof err === 'string' ? err : JSON.stringify(err));
                return store.notify('error', message);
              }),
            );
          }),
        ),
    [],
  );
};

export const useStoreAction = <A extends unknown[], R, E>(effectFn: (service: StoreService, ...args: A) => Effect.Effect<R, E, any>) => {
  return useStoreEffect((...args: A) => Effect.flatMap(StoreService, (s) => effectFn(s, ...args)));
};

export const useUpdateStore = () => useStoreAction((s, f: (state: AppRuntimeState) => AppRuntimeState) => s.update(f));
export const useToggleStore = (key: keyof Pick<AppRuntimeState, 'isSidebarOpen' | 'isSettingOpen'>) => useStoreAction((s) => s.toggle(key));
export const useToggleSidebar = () => useToggleStore('isSidebarOpen');
export const useToggleSetting = () => useToggleStore('isSettingOpen');
export const useUpdateSetting = () => useStoreAction((s, updates: Partial<AppRuntimeState['settings']>) => s.updateSetting(updates));
export const useConfirm = () => useStoreAction((s, config: Omit<ConfirmState, 'isOpen' | 'id'> & { onConfirm: () => void }) => s.setConfirm(config));
