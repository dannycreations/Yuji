import { Effect } from 'effect';
import { useMemo } from 'react';

import { INITIAL_GREETING, INITIAL_SUGGESTIONS } from '../../app/Constant';
import { getMessagePath } from '../../helpers/SessionHelper';
import { useAction, useStore } from '../../hooks/useStore';
import { useStream } from '../../hooks/useStream';
import { ChatService } from '../../services/ChatService';
import { Header } from '../Header';
import { Icon } from '../shared/Icon';
import { ChatInput } from './ChatInput';
import { ChatMessageBubble } from './ChatMessageBubble';

import type { FC } from 'react';
import type { AppState, Attachment, Message } from '../../app/Schema';

export const ChatInterface: FC = () => {
  const activeSessionId = useStore((s: AppState) => s.activeSessionId, null);
  const sessions = useStore((s: AppState) => s.sessions, {});
  const userName = useStore((s: AppState) => s.settings.personalisation.userName, '');

  const { isLoading, generate, stop: handleStop } = useStream();

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;

  const visibleMessages = useMemo(
    () => (activeSession?.activeMessageId ? getMessagePath(activeSession, activeSession.activeMessageId) : activeSession?.messages || []),
    [activeSession],
  );

  const handleSend = useAction((content: string, attachments: Attachment[] = []) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;

      let currentSessionId = activeSessionId;
      if (!currentSessionId) {
        const session = yield* chat.createSession();
        currentSessionId = session.id;
      }

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

  const handleRegenerate = useAction((messageId: string) =>
    Effect.gen(function* () {
      if (!activeSessionId) return;
      const chat = yield* ChatService;

      const session = sessions[activeSessionId];
      if (!session) return;

      const originalMessage = session.messages.find((m) => m.id === messageId);
      if (!originalMessage) return;

      const history =
        originalMessage.role === 'assistant'
          ? originalMessage.parentId
            ? yield* chat.getSessionPath(activeSessionId, originalMessage.parentId)
            : []
          : yield* chat.getSessionPath(activeSessionId, messageId);

      yield* generate(activeSessionId, history);
    }),
  );

  const handleEdit = useAction((messageId: string, newContent: string) =>
    Effect.gen(function* () {
      if (!activeSession) return;
      const chat = yield* ChatService;
      yield* chat.updateMessage(activeSession.id, messageId, newContent);
    }),
  );

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
      <div className="chat-scroll-area">
        <div className="message-list-container">
          {visibleMessages.map((message, idx) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              sessionId={activeSession.id}
              isLast={idx === visibleMessages.length - 1}
              isThinking={isLoading && idx === visibleMessages.length - 1 && message.role === 'assistant'}
              onRegenerate={() => handleRegenerate(message.id)}
              onEdit={(newContent) => handleEdit(message.id, newContent)}
            />
          ))}
        </div>
      </div>

      <ChatInput onSend={handleSend} onStop={handleStop} isLoading={isLoading} />
    </div>
  );
};
