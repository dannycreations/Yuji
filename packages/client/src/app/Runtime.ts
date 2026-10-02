import { Layer, Logger, ManagedRuntime, References } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { OpenAIProviderLive } from '@yuji/client/providers/OpenAIProvider';
import { ChatServiceLive } from '@yuji/client/services/ChatService';
import { StorageServiceLive } from '@yuji/client/services/StorageService';
import { StoreServiceLive } from '@yuji/client/services/StoreService';
import { ToolServiceLive } from '@yuji/client/services/ToolService';

const MainLogger = Logger.make<unknown, void>(({ logLevel, message }) => {
  // Ignore internal Effect errors
  if (!Array.isArray(message)) return;

  const messages = message as unknown[];
  switch (logLevel) {
    case 'Fatal':
    case 'Error':
      console.error(...messages);
      break;
    case 'Warn':
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
  Layer.provide(Logger.layer([MainLogger])),
  Layer.provide(Layer.succeed(References.MinimumLogLevel, import.meta.env.PROD ? 'Info' : 'Debug')),
).pipe(Layer.orDie);

export const YujiRuntime = ManagedRuntime.make(MainLayer);

export type YujiEnv = Layer.Success<typeof MainLayer>;
