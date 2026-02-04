import { useMemo } from 'react';

import { INITIAL_GREETING, INITIAL_SUGGESTIONS } from '../../app/Constant';
import { getMessagePath } from '../../helpers/SessionHelper';
import { useChatAction } from '../../hooks/useChatAction';
import { useStore } from '../../hooks/useStore';
import { Header } from '../Header';
import { Icon } from '../shared/Icon';
import { ChatInput } from './ChatInput';
import { ChatMessageBubble } from './ChatMessageBubble';

import type { FC } from 'react';

export const ChatInterface: FC = () => {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const activeSession = useStore((s) => (activeSessionId ? s.sessions[activeSessionId] : null));
  const showSuggestions = useStore((s) => s.settings.showSuggestions);
  const userName = useStore((s) => s.settings.personalisation.userName);

  const { isLoading, handleSend, handleRegenerate, handleEdit, stop: handleStop } = useChatAction();

  const visibleMessages = useMemo(
    () => (activeSession?.activeMessageId ? getMessagePath(activeSession, activeSession.activeMessageId) : activeSession?.messages || []),
    [activeSession?.activeMessageId, activeSession?.messages, activeSession?.id],
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

            {showSuggestions && (
              <div className="suggestion-grid">
                {INITIAL_SUGGESTIONS.map((suggestion, idx) => (
                  <button key={idx} onClick={() => handleSend(suggestion.prompt)} className="suggestion-item">
                    <Icon name={suggestion.icon} size={20} className="suggestion-item-icon" />
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
