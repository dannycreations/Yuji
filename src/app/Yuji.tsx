import './styles.css';

import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useContext, useEffect, useState } from 'react';

import { ChatInterface } from '../components/chat/ChatInterface';
import { GlobalSettingModal } from '../components/setting/GlobalSettingModal';
import { ConfirmModal } from '../components/shared/modal/ConfirmModal';
import { NotificationToast } from '../components/shared/NotificationToast';
import { Sidebar } from '../components/Sidebar';
import { StoreContext, useStore } from '../hooks/useStore';
import { StoreService } from '../services/StoreService';
import { YujiRuntime } from './Runtime';

const DatabaseErrorScreen = ({ error }: { error: string }) => {
  const storeService = useContext(StoreContext);
  const handleClearDatabase = () => {
    if (storeService) {
      YujiRuntime.runFork(storeService.clearDatabase());
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] text-white p-6 text-center">
      <div className="max-w-md w-full space-y-6">
        <div className="flex justify-center">
          <div className="p-4 bg-red-500/10 rounded-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-500"
            >
              <path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M16 19h6" />
            </svg>
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Database Conflict Detected</h1>
          <p className="text-zinc-400">
            Yuji encountered a problem while loading your database. This usually happens after an update or if the database was manually modified.
          </p>
        </div>

        <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800 text-left overflow-auto max-h-[200px]">
          <p className="text-xs font-mono text-red-400 break-all">{error}</p>
        </div>

        <div className="pt-4">
          <button
            onClick={handleClearDatabase}
            className="w-full py-3 px-4 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
          >
            Reset Database & Reload
          </button>
          <p className="mt-4 text-xs text-zinc-500">Warning: This will permanently delete all your local chat history and settings.</p>
        </div>
      </div>
    </div>
  );
};

const YujiLayout = () => {
  const theme = useStore((s) => s.settings.theme);
  const initializationError = useStore((s) => s.initializationError);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  return (
    <div className="app-container">
      {initializationError ? (
        <DatabaseErrorScreen error={initializationError} />
      ) : (
        <>
          <Sidebar />
          <main className="main-layout">
            <ChatInterface />
          </main>
          <GlobalSettingModal />
          <ConfirmModal />
          <NotificationToast />
        </>
      )}
    </div>
  );
};

export const YujiApp = () => {
  const [store, setStore] = useState<StoreService | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const fiber = YujiRuntime.runFork(
      Effect.gen(function* () {
        const service = yield* StoreService;
        setStore(service);

        const current = yield* SubscriptionRef.get(service.state);
        if (current.isHydrated) {
          setIsHydrated(true);
          return;
        }

        yield* service.state.changes.pipe(
          Stream.filter((s) => s.isHydrated),
          Stream.runHead,
          Effect.map(() => setIsHydrated(true)),
        );
      }),
    );
    return () => {
      YujiRuntime.runFork(Fiber.interrupt(fiber));
    };
  }, []);

  if (!store || !isHydrated) {
    return null;
  }

  return (
    <StoreContext.Provider value={store}>
      <YujiLayout />
    </StoreContext.Provider>
  );
};
