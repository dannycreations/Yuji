import { FetchHttpClient } from '@effect/platform';
import { Layer, ManagedRuntime } from 'effect';

import { OpenAIProviderLive } from '../providers/OpenAIProvider';
import { ChatServiceLive } from '../services/ChatService';
import { StorageServiceLive } from '../services/StorageService';
import { StoreServiceLive } from '../services/StoreService';

const MainLayer = ChatServiceLive.pipe(
  Layer.provideMerge(OpenAIProviderLive),
  Layer.provideMerge(StoreServiceLive),
  Layer.provideMerge(StorageServiceLive),
  Layer.provide(FetchHttpClient.layer),
).pipe(Layer.orDie);

export const YujiRuntime = ManagedRuntime.make(MainLayer);
