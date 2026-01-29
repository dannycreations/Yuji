import { FetchHttpClient } from '@effect/platform';
import { Effect, Stream } from 'effect';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_GREETING, SUGGESTIONS } from '../app/constants';
import { Attachment, Message } from '../app/types';
import { LLMError, streamCompletion } from '../services/llmService';
import { useStore } from '../stores/useStore';
import { Icon } from './Icon';
import { InputArea } from './InputArea';
import { MessageBubble } from './MessageBubble';

export const ChatInterface: React.FC = () => {
  const { activeSessionId, sessions, addMessage, updateMessage, settings, createSession } = useStore();

  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fiberRef = useRef<any>(null);

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

  const scrollToBottom = () => {
    // Only auto-scroll if we are near bottom or if it's a new message
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isLoading || visibleMessages.length > 0) {
      scrollToBottom();
    }
  }, [visibleMessages.length, activeSessionId, isLoading]);

  const handleStop = () => {
    if (fiberRef.current) {
      Effect.runFork(fiberRef.current.interruptAsFork(Effect.void));
      fiberRef.current = null;
      setIsLoading(false);
    }
  };

  const generateResponse = async (sessionId: string, messages: Message[]) => {
    const session = sessions[sessionId];
    if (!session) return;

    if (fiberRef.current) {
      await Effect.runPromise(fiberRef.current.interruptAsFork(Effect.void));
    }

    setIsLoading(true);

    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      parentId: messages[messages.length - 1]?.id,
    };
    addMessage(sessionId, assistantMessage);

    let fullContent = '';

    const streamEffect = Effect.gen(function* () {
      const stream = yield* streamCompletion(
        messages,
        session.systemPrompt || settings.defaultSystemPrompt,
        settings,
        session.modelConfig || { provider: 'openai', model: settings.defaultModel, temperature: 0.7 },
      );

      yield* Stream.runForEach(stream, (token) =>
        Effect.sync(() => {
          fullContent += token;
          updateMessage(sessionId, assistantMessageId, fullContent);
        }),
      );
    }).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          const msg = err instanceof LLMError ? err.message : 'Unknown error';
          console.error(err);
          updateMessage(sessionId, assistantMessageId, fullContent + `\n\n*[Error: ${msg}]*`);
        }),
      ),
      Effect.ensuring(Effect.sync(() => setIsLoading(false))),
      Effect.provide(FetchHttpClient.layer),
    );

    fiberRef.current = Effect.runFork(streamEffect as any);
  };

  const handleSend = async (content: string, attachments: Attachment[] = []) => {
    let currentSessionId = activeSessionId;

    if (!currentSessionId) {
      currentSessionId = createSession();
    }

    const session = sessions[currentSessionId];
    if (!session) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      attachments,
      timestamp: Date.now(),
    };
    addMessage(currentSessionId, userMessage);

    await generateResponse(currentSessionId, [...session.messages, userMessage]);
  };

  const handleRegenerate = async (messageId: string) => {
    if (!activeSession) return;

    const messageIndex = activeSession.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Regeneration strategy:
    // If we regenerate assistant message M, we use the same parent as M and generate a new response.
    const originalMessage = activeSession.messages[messageIndex];
    if (originalMessage.role !== 'assistant') return;

    const history = activeSession.messages.slice(0, messageIndex);
    await generateResponse(activeSession.id, history);
  };

  const handleEdit = async (messageId: string, newContent: string) => {
    if (!activeSession) return;

    const messageIndex = activeSession.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // In-chat branching strategy:
    // We add a new message with the same parent as the edited message.
    const originalMessage = activeSession.messages[messageIndex];
    const userMessageId = crypto.randomUUID();
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: newContent,
      attachments: originalMessage.attachments,
      timestamp: Date.now(),
      parentId: originalMessage.parentId,
    };

    addMessage(activeSession.id, userMessage);

    // To properly "branch" within the same session's flat list,
    // we should ideally filter the message list to only show the path to the current leaf.
    // For now, we append and generate.
    const history = activeSession.messages.slice(0, messageIndex);
    await generateResponse(activeSession.id, [...history, userMessage]);
  };

  if (!activeSession || activeSession.messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full bg-background relative">
        <div className="flex-1 min-h-0 overflow-y-auto w-full scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          <div className="flex flex-col items-center justify-center p-6 min-h-full animate-fade-in">
            <div className="w-14 h-14 bg-surface_light rounded-2xl shadow-xl flex items-center justify-center mb-6 border border-white/5">
              <Icon name="Bot" size={28} className="text-zinc-200" />
            </div>
            <h1 className="text-2xl font-display font-semibold text-white mb-6 text-center tracking-tight">{INITIAL_GREETING}</h1>

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
      <div className="flex-1 min-h-0 overflow-y-auto w-full scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        {visibleMessages.map((message, idx) => (
          <MessageBubble
            key={message.id}
            message={message}
            sessionId={activeSession.id}
            isLast={idx === visibleMessages.length - 1}
            onRegenerate={() => handleRegenerate(message.id)}
            onEdit={(newContent) => handleEdit(message.id, newContent)}
          />
        ))}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <InputArea onSend={handleSend} onStop={handleStop} isLoading={isLoading} />
    </div>
  );
};
