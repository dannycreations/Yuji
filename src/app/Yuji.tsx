import { FetchHttpClient } from '@effect/platform';
import { Layer, ManagedRuntime } from 'effect';

import { ChatInterface } from '../components/ChatInterface';
import { GlobalSettingModal } from '../components/setting/GlobalSettingModal';
import { ConfirmModal } from '../components/shared/ConfirmModal';
import { Sidebar } from '../components/Sidebar';
import { LLMProvider } from '../providers/LLMProvider';
import { OpenAIProviderLive } from '../providers/OpenAIProvider';
import { ChatService, ChatServiceLive } from '../services/ChatService';
import { PlatformService, PlatformServiceLive } from '../services/PlatformService';
import { StorageServiceLive } from '../services/StorageService';
import { StoreService, StoreServiceLive } from '../services/StoreService';

const MainLayer = ChatServiceLive.pipe(
  Layer.provideMerge(OpenAIProviderLive),
  Layer.provideMerge(PlatformServiceLive),
  Layer.provideMerge(StoreServiceLive),
  Layer.provideMerge(StorageServiceLive),
  Layer.provide(FetchHttpClient.layer),
).pipe(Layer.orDie) as Layer.Layer<LLMProvider | ChatService | PlatformService | StoreService, never, never>;

export const YujiRuntime = ManagedRuntime.make(MainLayer);

export const YujiApp = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-zinc-100 font-sans">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        <ChatInterface />
      </main>
      <GlobalSettingModal />
      <ConfirmModal />
    </div>
  );
};
