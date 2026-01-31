import { Effect, Stream, SubscriptionRef } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_GREETING, SUGGESTIONS } from '../app/Constant';
import { LLMProviderError } from '../app/Error';
import { YujiRuntime } from '../app/Yuji';
import { useStore } from '../hooks/useStore';
import { LLMProvider } from '../providers/LLMProvider';
import { ChatService } from '../services/ChatService';
import { PlatformService } from '../services/PlatformService';
import { StoreService } from '../services/StoreService';
import { InputArea } from './InputArea';
import { MessageBubble } from './MessageBubble';
import { Icon } from './shared/Icon';
import { VirtualBlock } from './shared/VirtualBlock';

import type { FC } from 'react';
import type { AppState, Attachment, Message } from '../app/Schema';

export const ChatInterface: FC = () => {
  const activeSessionId = useStore((s: AppState) => s.activeSessionId, null);
  const sessions = useStore((s: AppState) => s.sessions, {});

  const [isLoading, setIsLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fiberRef = useRef<any>(null);
  const isAutoScrolling = useRef(true);

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;

  const visibleMessages = useMemo(() => {
    if (!activeSession) return [];
    if (!activeSession.activeMessageId) return activeSession.messages;

    const path: Message[] = [];
    let currentId: string | undefined = activeSession.activeMessageId;

    while (currentId) {
      const msg: Message | undefined = activeSession.messages.find((m) => m.id === currentId);
      if (msg) {
        path.unshift(msg);
        currentId = msg.parentId;
      } else {
        currentId = undefined;
      }
    }
    return path;
  }, [activeSession]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 100;
    isAutoScrolling.current = atBottom;
  };

  // Handle session change: instant scroll to bottom
  useEffect(() => {
    if (activeSessionId && visibleMessages.length > 0) {
      isAutoScrolling.current = true;
      // Small delay to ensure DOM is ready and VirtualBlocks have registered their sizes
      const timer = setTimeout(() => {
        scrollToBottom('auto');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeSessionId]);

  // Handle new messages: smooth scroll
  useEffect(() => {
    if (visibleMessages.length > 0) {
      scrollToBottom('smooth');
      isAutoScrolling.current = true;
    }
  }, [visibleMessages.length]);

  // Handle streaming content updates: pinning to bottom
  const lastMessageContent = visibleMessages[visibleMessages.length - 1]?.content;
  useEffect(() => {
    if (isLoading && isAutoScrolling.current) {
      scrollToBottom('auto');
    }
  }, [lastMessageContent, isLoading]);

  const handleStop = () => {
    if (fiberRef.current) {
      YujiRuntime.runFork(fiberRef.current.interruptAsFork(Effect.void));
      fiberRef.current = null;
      setIsLoading(false);
    }
  };

  const generateResponse = (sessionId: string, messagesToProcess: ReadonlyArray<Message>) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      const llm = yield* LLMProvider;
      const chat = yield* ChatService;

      const state = yield* SubscriptionRef.get(store.state);
      const session = state.sessions[sessionId];
      const latestSettings = state.settings;

      if (!session) return;

      if (fiberRef.current) {
        yield* fiberRef.current.interruptAsFork(Effect.void);
      }

      setIsLoading(true);

      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        parentId: messagesToProcess[messagesToProcess.length - 1]?.id,
      };

      const streamEffect = Effect.gen(function* () {
        yield* chat.addMessage(sessionId, assistantMessage);

        const stream = yield* llm.streamCompletion(
          messagesToProcess,
          latestSettings.defaultSystemPrompt,
          latestSettings,
          session.modelConfig || { provider: 'openai', model: latestSettings.defaultModel, temperature: 0.7 },
          session.systemPrompt,
          session.overrideGlobalPrompt,
        );

        let fullContent = '';
        yield* Stream.runForEach(stream, (token) =>
          Effect.gen(function* () {
            fullContent += token;
            yield* chat.updateMessage(sessionId, assistantMessageId, fullContent);
          }),
        );
      }).pipe(
        Effect.catchAll((err) =>
          Effect.gen(function* () {
            const msg = err instanceof LLMProviderError ? err.message : 'Unknown error';
            console.error(err);
            yield* chat.updateMessage(sessionId, assistantMessageId, `*[Error: ${msg}]*`);
          }),
        ),
        Effect.ensuring(Effect.sync(() => setIsLoading(false))),
      );

      fiberRef.current = yield* Effect.forkDaemon(streamEffect);
    });

  const handleSend = (content: string, attachments: Attachment[] = []) => {
    const sendEffect = Effect.gen(function* () {
      const chat = yield* ChatService;
      const platform = yield* PlatformService;

      let currentSessionId = activeSessionId;
      if (!currentSessionId) {
        const session = yield* chat.createSession();
        currentSessionId = session.id;
      }

      const parentId = activeSession?.activeMessageId;
      const userMessageId = yield* platform.nextId;
      const now = yield* platform.now;
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content,
        attachments,
        timestamp: now,
        parentId,
      };

      yield* chat.addMessage(currentSessionId, userMessage);
      const history = yield* chat.getSessionPath(currentSessionId, userMessage.id);

      yield* generateResponse(currentSessionId, history);
    });

    YujiRuntime.runFork(sendEffect as Effect.Effect<void, never, any>);
  };

  const handleRegenerate = (messageId: string) => {
    if (!activeSessionId) return;

    const regenerateEffect = Effect.gen(function* () {
      const chat = yield* ChatService;
      const store = yield* StoreService;
      const state = yield* SubscriptionRef.get(store.state);
      const session = state.sessions[activeSessionId];

      if (!session) return;

      const originalMessage = session.messages.find((m) => m.id === messageId);
      if (!originalMessage || originalMessage.role !== 'assistant') return;

      const history = originalMessage.parentId ? yield* chat.getSessionPath(activeSessionId, originalMessage.parentId) : [];

      yield* generateResponse(activeSessionId, history);
    }).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error('Failed to regenerate:', err);
        }),
      ),
    );

    YujiRuntime.runFork(regenerateEffect as Effect.Effect<void, never, any>);
  };

  const handleEdit = (messageId: string, newContent: string) => {
    if (!activeSession) return;

    const editEffect = Effect.gen(function* () {
      const chat = yield* ChatService;
      const platform = yield* PlatformService;
      const originalMessage = activeSession.messages.find((m) => m.id === messageId);
      if (!originalMessage) return;

      const userMessageId = yield* platform.nextId;
      const now = yield* platform.now;
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: newContent,
        attachments: originalMessage.attachments,
        timestamp: now,
        parentId: originalMessage.parentId,
      };

      yield* chat.addMessage(activeSession.id, userMessage);
      const history = yield* chat.getSessionPath(activeSession.id, userMessageId);

      yield* generateResponse(activeSession.id, history);
    });

    YujiRuntime.runFork(editEffect as Effect.Effect<void, never, any>);
  };

  if (!activeSession || activeSession.messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full bg-background relative">
        <div className="flex-1 min-h-0 overflow-y-auto w-full scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          <div className="flex flex-col items-center justify-center p-6 min-h-full animate-fade-in">
            <div className="w-14 h-14 bg-surface_light rounded-2xl shadow-xl flex items-center justify-center mb-6 border border-white/5">
              <Icon name="Bot" size={28} className="text-zinc-200" />
            </div>
            <h1 className="text-xl font-display font-semibold text-white mb-6 text-center tracking-tight">{INITIAL_GREETING}</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl mb-8">
              {SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(suggestion.prompt)}
                  className="flex items-start gap-3.5 p-4 rounded-xl bg-surface hover:bg-surface_light border border-surface_light hover:border-zinc-700 transition-all text-left group hover:shadow-md"
                >
                  <Icon
                    name={suggestion.icon as any}
                    size={20}
                    className="text-primary mt-0.5 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all"
                  />
                  <div>
                    <div className="font-medium text-zinc-200 text-sm mb-1">{suggestion.label}</div>
                    <div className="text-zinc-500 text-xs line-clamp-2 leading-relaxed">{suggestion.prompt}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <InputArea onSend={handleSend} onStop={handleStop} isLoading={isLoading} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto w-full scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
      >
        {visibleMessages.map((message, idx) => (
          <VirtualBlock key={message.id}>
            <MessageBubble
              message={message}
              sessionId={activeSession.id}
              isLast={idx === visibleMessages.length - 1}
              isThinking={isLoading && idx === visibleMessages.length - 1 && message.role === 'assistant'}
              onRegenerate={() => handleRegenerate(message.id)}
              onEdit={(newContent) => handleEdit(message.id, newContent)}
            />
          </VirtualBlock>
        ))}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <InputArea onSend={handleSend} onStop={handleStop} isLoading={isLoading} />
    </div>
  );
};
