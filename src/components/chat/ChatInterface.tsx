import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_GREETING, SUGGESTIONS } from '../../app/Constant';
import { LLMProviderError } from '../../app/Error';
import { YujiRuntime } from '../../app/Yuji';
import { useStore } from '../../hooks/useStore';
import { LLMProvider, synthesizeSystemPrompt } from '../../providers/LLMProvider';
import { ChatService } from '../../services/ChatService';
import { PlatformService } from '../../services/PlatformService';
import { StoreService } from '../../services/StoreService';
import { Header } from '../Header';
import { Icon } from '../shared/Icon';
import { ChatInput } from './ChatInput';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatMessageVirtual } from './ChatMessageVirtual';

import type { FC } from 'react';
import type { MessageNotFoundError, SessionNotFoundError } from '../../app/Error';
import type { AppState, Attachment, Message } from '../../app/Schema';

export const ChatInterface: FC = () => {
  const activeSessionId = useStore((s: AppState) => s.activeSessionId, null);
  const sessions = useStore((s: AppState) => s.sessions, {});
  const userName = useStore((s: AppState) => s.settings.userName, '');

  const [isLoading, setIsLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fiberRef = useRef<Fiber.Fiber<void, SessionNotFoundError | MessageNotFoundError>>(null);
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
      YujiRuntime.runFork(Fiber.interrupt(fiberRef.current));
      fiberRef.current = null;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (fiberRef.current) {
        YujiRuntime.runFork(Fiber.interrupt(fiberRef.current));
      }
    };
  }, []);

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
        yield* Fiber.interrupt(fiberRef.current);
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

        const systemPrompt = synthesizeSystemPrompt(latestSettings, session.systemPrompt, session.overrideGlobalPrompt);

        const stream = yield* llm.streamCompletion(
          messagesToProcess,
          latestSettings,
          session.modelConfig || { provider: 'openai', model: latestSettings.defaultModel, temperature: 0.7 },
          systemPrompt,
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

    YujiRuntime.runFork(sendEffect);
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

    YujiRuntime.runFork(regenerateEffect);
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

    YujiRuntime.runFork(editEffect);
  };

  if (!activeSession || activeSession.messages.length === 0) {
    return (
      <div className="main-layout">
        <Header />
        <div className="chat-scroll-area">
          <div className="chat-empty-container">
            <div className="mb-4 flex flex-col items-center">
              <div className="chat-empty-icon-wrapper">
                <Icon name="Bot" size={24} className="text-background" />
              </div>
              <h1 className="chat-empty-title">
                {INITIAL_GREETING.replace('{{0}}', userName.trim() ? `, ${userName.trim().split(/\s+/)[0]}` : ' today')}
              </h1>
            </div>

            <div className="suggestion-grid">
              {SUGGESTIONS.map((suggestion, idx) => (
                <button key={idx} onClick={() => handleSend(suggestion.prompt)} className="suggestion-item">
                  <Icon name={suggestion.icon} size={20} className="suggestion-item-icon" />
                  <div className="suggestion-item-label">{suggestion.label}</div>
                  <div className="suggestion-item-prompt">{suggestion.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <ChatInput onSend={handleSend} onStop={handleStop} isLoading={isLoading} />
      </div>
    );
  }

  return (
    <div className="main-layout">
      <Header />
      <div ref={scrollContainerRef} onScroll={handleScroll} className="chat-scroll-area">
        <div className="message-list-container">
          {visibleMessages.map((message, idx) => (
            <ChatMessageVirtual key={message.id}>
              <ChatMessageBubble
                message={message}
                sessionId={activeSession.id}
                isLast={idx === visibleMessages.length - 1}
                isThinking={isLoading && idx === visibleMessages.length - 1 && message.role === 'assistant'}
                onRegenerate={() => handleRegenerate(message.id)}
                onEdit={(newContent) => handleEdit(message.id, newContent)}
              />
            </ChatMessageVirtual>
          ))}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      <ChatInput onSend={handleSend} onStop={handleStop} isLoading={isLoading} />
    </div>
  );
};
