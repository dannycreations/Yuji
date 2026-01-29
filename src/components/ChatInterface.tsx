import React, { useEffect, useRef, useState } from 'react';

import { INITIAL_GREETING, SUGGESTIONS } from '../app/constants';
import { Attachment, Message } from '../app/types';
import { streamChatCompletion } from '../services/llmService';
import { useStore } from '../stores/useStore';
import { Icon } from './Icon';
import { InputArea } from './InputArea';
import { MessageBubble } from './MessageBubble';

export const ChatInterface: React.FC = () => {
  const { activeSessionId, sessions, addMessage, updateMessage, settings, createSession } = useStore();

  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages.length, activeSessionId]);

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
    setIsLoading(true);

    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    addMessage(currentSessionId, assistantMessage);

    let fullContent = '';

    await streamChatCompletion(
      [...session.messages, userMessage],
      session.systemPrompt || settings.defaultSystemPrompt,
      settings,
      session.modelConfig || { provider: 'openai', model: settings.defaultModel, temperature: 0.7 },
      {
        onToken: (token) => {
          fullContent += token;
          updateMessage(currentSessionId!, assistantMessageId, fullContent);
        },
        onComplete: () => {
          setIsLoading(false);
        },
        onError: (err) => {
          console.error(err);
          updateMessage(currentSessionId!, assistantMessageId, fullContent + `\n\n*[Error: ${err.message}]*`);
          setIsLoading(false);
        },
      },
    );
  };

  if (!activeSession || activeSession.messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full bg-background relative">
        <div className="flex-1 min-h-0 overflow-y-auto w-full scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          <div className="flex flex-col items-center justify-center p-6 min-h-full animate-fade-in">
            <div className="w-14 h-14 bg-surface_light rounded-2xl shadow-xl flex items-center justify-center mb-6 border border-white/5">
              <Icon name="Bot" size={28} className="text-zinc-200" />
            </div>
            <h1 className="text-2xl font-semibold text-white mb-6 text-center tracking-tight">{INITIAL_GREETING}</h1>

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
        <InputArea onSend={handleSend} isLoading={isLoading} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      <div className="flex-1 min-h-0 overflow-y-auto w-full scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        {activeSession.messages.map((message) => (
          <MessageBubble key={message.id} message={message} sessionId={activeSession.id} />
        ))}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <InputArea onSend={handleSend} isLoading={isLoading} />
    </div>
  );
};
