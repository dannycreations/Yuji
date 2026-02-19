import { FetchHttpClient } from '@effect/platform';
import { Layer, Logger, LogLevel, ManagedRuntime } from 'effect';

import { OpenAIProviderLive } from '../providers/OpenAIProvider';
import { ChatServiceLive } from '../services/ChatService';
import { StorageServiceLive } from '../services/StorageService';
import { StoreServiceLive } from '../services/StoreService';

const MainLogger = Logger.make<unknown, void>((options) => {
  if (Array.isArray(options.message)) {
    const messages = options.message as unknown[];
    switch (options.logLevel.label) {
      case 'FATAL':
      case 'ERROR':
        console.error(...messages);
        break;
      case 'WARN':
        console.warn(...messages);
        break;
      case 'INFO':
        console.info(...messages);
        break;
      case 'DEBUG':
      case 'TRACE':
        console.debug(...messages);
        break;
      default:
        console.log(...messages);
    }
  }
});

const MainLayer = ChatServiceLive.pipe(
  Layer.provideMerge(OpenAIProviderLive),
  Layer.provideMerge(StoreServiceLive),
  Layer.provideMerge(StorageServiceLive),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(Logger.replace(Logger.defaultLogger, MainLogger)),
  Layer.provide(Logger.minimumLogLevel(import.meta.env.PROD ? LogLevel.Info : LogLevel.Debug)),
).pipe(Layer.orDie);

export const YujiRuntime = ManagedRuntime.make(MainLayer);
