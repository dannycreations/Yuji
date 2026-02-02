import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useCallback, useEffect, useRef, useState } from 'react';

import { LLMProviderError } from '../app/Error';
import { YujiRuntime } from '../app/Yuji';
import { LLMProvider, synthesizeSystemPrompt } from '../providers/LLMProvider';
import { ChatService } from '../services/ChatService';
import { StoreService } from '../services/StoreService';
import { useStore, useStoreEffect } from './useStore';

import type { Attachment, Message } from '../app/Schema';

const useStream = () => {
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

export const useChatAction = () => {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const sessions = useStore((s) => s.sessions);
  const { generate, stop, isLoading } = useStream();

  const handleSend = useStoreEffect((content: string, attachments: Attachment[] = []) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      let currentSessionId = activeSessionId;

      if (!currentSessionId) {
        const session = yield* chat.createSession();
        currentSessionId = session.id;
      }

      const activeSession = sessions[currentSessionId];
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        attachments,
        timestamp: Date.now(),
        parentId: activeSession?.activeMessageId,
      };

      yield* chat.addMessage(currentSessionId, userMessage);
      const history = yield* chat.getSessionPath(currentSessionId, userMessage.id);
      yield* generate(currentSessionId, history);
    }),
  );

  const handleRegenerate = useStoreEffect((sessionId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      const session = sessions[sessionId];
      if (!session) return;

      const originalMessage = session.messages.find((m) => m.id === messageId);
      if (!originalMessage) return;

      const history =
        originalMessage.role === 'assistant'
          ? originalMessage.parentId
            ? yield* chat.getSessionPath(sessionId, originalMessage.parentId)
            : []
          : yield* chat.getSessionPath(sessionId, messageId);

      yield* generate(sessionId, history);
    }),
  );

  const handleEdit = useStoreEffect((sessionId: string, messageId: string, newContent: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateMessage(sessionId, messageId, newContent);
    }),
  );

  const handleDeleteMessage = useStoreEffect((sessionId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.deleteMessage(sessionId, messageId);
    }),
  );

  const handleBranch = useStoreEffect((sessionId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.branchChat(sessionId, messageId);
    }),
  );

  const handleSwitchBranch = useStoreEffect((sessionId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateSession(sessionId, (session) => ({
        ...session,
        activeMessageId: messageId,
      }));
    }),
  );

  const handleDeleteSession = useStoreEffect((sessionId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.deleteSession(sessionId);
    }),
  );

  const handleCreateSession = useStoreEffect(() =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.createSession();
    }),
  );

  return {
    isLoading,
    stop,
    handleSend,
    handleRegenerate,
    handleEdit,
    handleDeleteMessage,
    handleBranch,
    handleSwitchBranch,
    handleDeleteSession,
    handleCreateSession,
  };
};
