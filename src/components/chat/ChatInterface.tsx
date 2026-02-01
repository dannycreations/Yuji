import { Effect, Fiber, Stream, SubscriptionRef } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_GREETING, INITIAL_SUGGESTIONS } from '../../app/Constant';
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
    if (scrollContainerRef.current) {
      if (behavior === 'instant') {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
      }
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 100;
    isAutoScrolling.current = atBottom;
  };

  // Reset auto-scroll and force jump when switching sessions
  useEffect(() => {
    isAutoScrolling.current = true;
    if (visibleMessages.length > 0) {
      // Double RAF to ensure layout has settled for virtualized elements
      const frame1 = requestAnimationFrame(() => {
        const frame2 = requestAnimationFrame(() => {
          scrollToBottom('instant');
        });
        return () => cancelAnimationFrame(frame2);
      });
      return () => cancelAnimationFrame(frame1);
    }
  }, [activeSessionId, visibleMessages.length > 0]);

  // Handle streaming content updates: pinning to bottom
  const lastMessageId = visibleMessages[visibleMessages.length - 1]?.id;
  const lastMessageContent = visibleMessages[visibleMessages.length - 1]?.content;

  useEffect(() => {
    if (isLoading && isAutoScrolling.current) {
      const frame = requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [lastMessageId, lastMessageContent, isLoading]);

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
            yield* store.notify('error', `Chat error: ${msg}`);
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

    YujiRuntime.runFork(
      sendEffect.pipe(
        Effect.catchAll((err) =>
          Effect.gen(function* () {
            const store = yield* StoreService;
            yield* store.notify('error', `Failed to send message: ${err}`);
          }),
        ),
      ),
    );
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
      if (!originalMessage) return;

      const history =
        originalMessage.role === 'assistant'
          ? originalMessage.parentId
            ? yield* chat.getSessionPath(activeSessionId, originalMessage.parentId)
            : []
          : yield* chat.getSessionPath(activeSessionId, messageId);

      yield* generateResponse(activeSessionId, history);
    }).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error('Failed to regenerate:', err);
        }),
      ),
    );

    YujiRuntime.runFork(
      regenerateEffect.pipe(
        Effect.catchAll((err) =>
          Effect.gen(function* () {
            const store = yield* StoreService;
            yield* store.notify('error', `Failed to regenerate: ${err}`);
          }),
        ),
      ),
    );
  };

  const handleEdit = (messageId: string, newContent: string) => {
    if (!activeSession) return;

    const editEffect = Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateMessage(activeSession.id, messageId, newContent);
    });

    YujiRuntime.runFork(
      editEffect.pipe(
        Effect.catchAll((err) =>
          Effect.gen(function* () {
            const store = yield* StoreService;
            yield* store.notify('error', `Failed to edit message: ${err}`);
          }),
        ),
      ),
    );
  };

  if (!activeSession || activeSession.messages.length === 0) {
    return (
      <div className="main-layout">
        <Header />
        <div className="chat-scroll-area">
          <div className="chat-empty-container">
            <div className="mb-3 flex flex-col items-center">
              <div className="chat-empty-icon-wrapper">
                <Icon name="Bot" size={24} className="text-background" />
              </div>
              <h1 className="chat-empty-title">
                {INITIAL_GREETING.replace('{{0}}', userName.trim() ? `, ${userName.trim().split(/\s+/)[0]}` : ' today')}
              </h1>
            </div>

            <div className="suggestion-grid">
              {INITIAL_SUGGESTIONS.map((suggestion, idx) => (
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
