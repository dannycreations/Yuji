import '@yuji/client/app/styles.css';

import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useEffect, useState } from 'react';

import { reportError } from '@yuji/client/app/Error';
import { YujiRuntime } from '@yuji/client/app/Runtime';
import { ChatInterface } from '@yuji/client/components/chat/ChatInterface';
import { GlobalSettingModal } from '@yuji/client/components/setting/GlobalSettingModal';
import { ButtonInput } from '@yuji/client/components/shared/InputArea';
import { ConfirmModal } from '@yuji/client/components/shared/modal/ConfirmModal';
import { Notification } from '@yuji/client/components/shared/Notification';
import { Sidebar } from '@yuji/client/components/Sidebar';
import { StoreContext, useStore, useStoreAction } from '@yuji/client/hooks/useStore';
import { StoreService } from '@yuji/client/services/StoreService';

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
          <h1 className="text-2xl font-bold tracking-tight">Database Error</h1>
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
          <ButtonInput onClick={handleDeleteDatabase} variant="primary" className="w-full p-3! rounded-lg!">
            Delete Database & Reload
          </ButtonInput>
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

  if (initializationError) {
    return (
      <div className="app-container">
        <DatabaseErrorView error={initializationError} />
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <ChatInterface />
      <GlobalSettingModal />
      <ConfirmModal />
      <Notification />
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

    const handleWindowError = (event: ErrorEvent) => {
      YujiRuntime.runPromise(reportError('Uncaught error', event.error));
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      YujiRuntime.runPromise(reportError('Unhandled promise rejection', event.reason));
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleRejection);
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
