import './styles.css';

import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useEffect, useState } from 'react';

import { ChatInterface } from '../components/chat/ChatInterface';
import { GlobalSettingModal } from '../components/setting/GlobalSettingModal';
import { InputButton } from '../components/shared/InputArea';
import { ConfirmModal } from '../components/shared/modal/ConfirmModal';
import { NotificationToast } from '../components/shared/NotificationToast';
import { Sidebar } from '../components/Sidebar';
import { StoreContext, useStore, useStoreAction } from '../hooks/useStore';
import { StoreService } from '../services/StoreService';
import { YujiRuntime } from './Runtime';

const DatabaseErrorView = ({ error }: { error: string }) => {
  const handleDeleteDatabase = useStoreAction((s) => s.deleteDatabase());

  return (
    <div className="database-error-container">
      <div className="database-error-content">
        <div className="flex-center">
          <div className="database-error-icon-wrapper">
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
              className="text-danger"
            >
              <path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M16 19h6" />
            </svg>
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Database Conflict Detected</h1>
          <p className="text-text-secondary">
            Yuji encountered a problem while loading your database. This usually happens after an update or if the database was manually modified.
          </p>
        </div>

        {error && (
          <div className="database-error-details">
            <p className="text-xs font-mono text-danger break-all">{error}</p>
          </div>
        )}

        <div>
          <InputButton onClick={handleDeleteDatabase} variant="primary" className="w-full p-3! rounded-lg!">
            Delete Database & Reload
          </InputButton>
          <p className="mt-2 text-xs text-text-tertiary">Warning: This will permanently delete all your local chat history and settings.</p>
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
        <DatabaseErrorView error={initializationError} />
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
