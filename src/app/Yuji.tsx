import './styles.css';

import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useEffect, useState } from 'react';

import { ChatInterface } from '../components/chat/ChatInterface';
import { GlobalSettingModal } from '../components/setting/GlobalSettingModal';
import { ConfirmModal } from '../components/shared/modal/ConfirmModal';
import { NotificationToast } from '../components/shared/NotificationToast';
import { Sidebar } from '../components/Sidebar';
import { StoreContext, useStore } from '../hooks/useStore';
import { StoreService } from '../services/StoreService';
import { YujiRuntime } from './Runtime';

const YujiLayout = () => {
  const theme = useStore((s) => s.settings.theme);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-layout">
        <ChatInterface />
      </main>
      <GlobalSettingModal />
      <ConfirmModal />
      <NotificationToast />
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
