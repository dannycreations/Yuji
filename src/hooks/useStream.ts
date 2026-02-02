import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useCallback, useEffect, useRef, useState } from 'react';

import { LLMProviderError } from '../app/Error';
import { YujiRuntime } from '../app/Yuji';
import { LLMProvider, synthesizeSystemPrompt } from '../providers/LLMProvider';
import { ChatService } from '../services/ChatService';
import { StoreService } from '../services/StoreService';

import type { Message } from '../app/Schema';

export const useStream = () => {
  const [isLoading, setIsLoading] = useState(false);
  const fiberRef = useRef<Fiber.Fiber<void, any> | null>(null);

  const stop = useCallback(() => {
    if (fiberRef.current) {
      YujiRuntime.runFork(Fiber.interrupt(fiberRef.current));
      fiberRef.current = null;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (fiberRef.current) {
        YujiRuntime.runFork(Fiber.interrupt(fiberRef.current));
      }
    };
  }, []);

  const generate = useCallback(
    (sessionId: string, messagesToProcess: ReadonlyArray<Message>) =>
      Effect.gen(function* () {
        const store = yield* StoreService;
        const llm = yield* LLMProvider;
        const chat = yield* ChatService;

        const state = yield* SubscriptionRef.get(store.state);
        const settings = state.settings;
        const session = state.sessions[sessionId];

        if (!session) return;

        if (fiberRef.current) {
          yield* Fiber.interrupt(fiberRef.current);
        }

        setIsLoading(true);

        const id = crypto.randomUUID();
        const assistantMessage: Message = {
          id,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          parentId: messagesToProcess[messagesToProcess.length - 1]?.id,
        };

        const streamEffect = Effect.gen(function* () {
          yield* chat.addMessage(sessionId, assistantMessage);

          const systemPrompt = synthesizeSystemPrompt(settings, session);
          const model = session.general.model || settings.model;

          const stream = yield* llm.streamCompletion(
            messagesToProcess,
            settings,
            {
              provider: 'openai',
              model,
              temperature: 0.7,
            },
            systemPrompt,
          );

          let fullContent = '';
          yield* Stream.runForEach(stream, (token) =>
            Effect.gen(function* () {
              fullContent += token;
              yield* chat.updateMessage(sessionId, id, fullContent);
            }),
          );
        }).pipe(
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              const msg = err instanceof LLMProviderError ? err.message : 'Unknown error';
              console.error(err);
              yield* chat.updateMessage(sessionId, id, `*[Error: ${msg}]*`, true);
              yield* store.notify('error', `Chat error: ${msg}`);
            }),
          ),
          Effect.ensuring(Effect.sync(() => setIsLoading(false))),
        );

        fiberRef.current = yield* Effect.forkDaemon(streamEffect);
      }),
    [],
  );

  return { isLoading, generate, stop };
};
