import { FetchHttpClient } from '@effect/platform';
import { Layer, Logger, LogLevel, ManagedRuntime } from 'effect';

import { OpenAIProviderLive } from '../providers/OpenAIProvider';
import { ChatServiceLive } from '../services/ChatService';
import { StorageServiceLive } from '../services/StorageService';
import { StoreServiceLive } from '../services/StoreService';
import { ToolServiceLive } from '../services/ToolService';

const MainLogger = Logger.make<unknown, void>(({ logLevel, message }) => {
  // Ignore internal Effect errors
  if (!Array.isArray(message)) return;

  const messages = message as unknown[];
  switch (logLevel._tag) {
    case 'Fatal':
    case 'Error':
      console.error(...messages);
      break;
    case 'Warning':
      console.warn(...messages);
      break;
    case 'Debug':
    case 'Trace':
      console.debug(...messages);
      break;
    case 'All':
    case 'Info':
      console.info(...messages);
      break;
    case 'None':
    default:
      break;
  }
});

const MainLayer = ChatServiceLive.pipe(
  Layer.provideMerge(OpenAIProviderLive),
  Layer.provideMerge(ToolServiceLive),
  Layer.provideMerge(StoreServiceLive),
  Layer.provideMerge(StorageServiceLive),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(Logger.replace(Logger.defaultLogger, MainLogger)),
  Layer.provide(Logger.minimumLogLevel(import.meta.env.PROD ? LogLevel.Info : LogLevel.Debug)),
).pipe(Layer.orDie);

export const YujiRuntime = ManagedRuntime.make(MainLayer);

export type YujiEnv = ManagedRuntime.ManagedRuntime.Context<typeof YujiRuntime>;
