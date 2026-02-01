import { FetchHttpClient } from '@effect/platform';
import { Layer, ManagedRuntime } from 'effect';

import { ChatInterface } from '../components/chat/ChatInterface';
import { GlobalSettingModal } from '../components/setting/GlobalSettingModal';
import { ConfirmModal } from '../components/shared/modal/ConfirmModal';
import { Sidebar } from '../components/Sidebar';
import { OpenAIProviderLive } from '../providers/OpenAIProvider';
import { ChatServiceLive } from '../services/ChatService';
import { PlatformServiceLive } from '../services/PlatformService';
import { StorageServiceLive } from '../services/StorageService';
import { StoreServiceLive } from '../services/StoreService';

const MainLayer = ChatServiceLive.pipe(
  Layer.provideMerge(OpenAIProviderLive),
  Layer.provideMerge(PlatformServiceLive),
  Layer.provideMerge(StoreServiceLive),
  Layer.provideMerge(StorageServiceLive),
  Layer.provide(FetchHttpClient.layer),
).pipe(Layer.orDie);

export const YujiRuntime = ManagedRuntime.make(MainLayer);

export const YujiApp = () => {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-layout">
        <ChatInterface />
      </main>
      <GlobalSettingModal />
      <ConfirmModal />
    </div>
  );
};
