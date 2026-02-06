import { Effect } from 'effect';
import { useEffect, useMemo } from 'react';

import { INITIAL_GREETING, INITIAL_SUGGESTIONS } from '../../app/Constant';
import { getMessagePath } from '../../helpers/SessionHelper';
import { useChatAction } from '../../hooks/useChatAction';
import { useStore, useStoreEffect } from '../../hooks/useStore';
import { StoreService } from '../../services/StoreService';
import { Header } from '../Header';
import { Icon } from '../shared/Icon';
import { ChatInput } from './ChatInput';
import { ChatMessageBubble } from './ChatMessageBubble';

import type { FC } from 'react';

export const ChatInterface: FC = () => {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const activeSession = useStore((s) => s.activeSession);
  const showSuggestions = useStore((s) => s.settings.showSuggestions);
  const userName = useStore((s) => s.settings.personalisation.userName);

  const { isLoading, handleSend, handleRegenerate, handleEdit, stop: handleStop } = useChatAction();

  const loadMessages = useStoreEffect((id: string) =>
    Effect.gen(function* () {
      const s = yield* StoreService;
      yield* s.loadMessages(id);
    }),
  );

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    }
  }, [activeSessionId]);

  const visibleMessages = useMemo(
    () =>
      activeSession?.activeMessageId
        ? getMessagePath(activeSession, activeSession.activeMessageId)
        : activeSession
          ? Object.values(activeSession.messages).sort((a, b) => a.timestamp - b.timestamp)
          : [],
    [activeSession?.activeMessageId, activeSession?.messages, activeSession?.id],
  );

  if (!activeSession || Object.keys(activeSession.messages).length === 0) {
    return (
      <div className="main-layout selection:bg-primary/20">
        <Header />
        <div className="chat-scroll-area">
          <div className="chat-empty-container">
            <div className="mb-3 flex flex-col items-center w-full select-none">
              <div className="header-icon-wrapper">
                <Icon name="Bot" size={24} className="text-background" />
              </div>
              <h1 className="chat-empty-title selection:bg-primary/20">
                {INITIAL_GREETING.replace('{{0}}', userName.trim() ? `, ${userName.trim().split(/\s+/)[0]}` : ' today')}
              </h1>
            </div>

            {showSuggestions && (
              <div className="suggestion-grid">
                {INITIAL_SUGGESTIONS.map((suggestion, idx) => (
                  <button key={idx} onClick={() => handleSend(suggestion.prompt)} className="suggestion-item">
                    <Icon name={suggestion.icon} size={20} className="suggestion-item-icon text-text-tertiary" />
                    <div className="suggestion-item-label">{suggestion.label}</div>
                    <div className="suggestion-item-prompt">{suggestion.prompt}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <ChatInput onSend={handleSend} onStop={handleStop} isLoading={isLoading} />
      </div>
    );
  }

  return (
    <div className="main-layout selection:bg-primary/20">
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
              onRegenerate={() => handleRegenerate(activeSession.id, message.id)}
              onEdit={(newContent) => handleEdit(activeSession.id, message.id, newContent)}
            />
          ))}
        </div>
      </div>

      <ChatInput onSend={handleSend} onStop={handleStop} isLoading={isLoading} />
    </div>
  );
};
