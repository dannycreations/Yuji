import { useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_SUGGESTIONS } from '../../app/Constant';
import { getMessagePath } from '../../helpers/SessionHelper';
import { getGreeting } from '../../helpers/UserHelper';
import { useChatAction } from '../../hooks/useChatAction';
import { useStore, useStoreAction } from '../../hooks/useStore';
import { useVirtualList } from '../../hooks/useVirtualList';
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

  const loadMessages = useStoreAction((s, id: string) => s.loadMessages(id));

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      if (scrollAreaRef.current) {
        setContainerHeight(scrollAreaRef.current.clientHeight);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const visibleMessages = useMemo(() => {
    if (!activeSession) return [];
    if (activeSession.activeMessageId) return getMessagePath(activeSession, activeSession.activeMessageId);
    return Object.values(activeSession.messages).sort((a, b) => a.timestamp - b.timestamp);
  }, [activeSession?.activeMessageId, activeSession?.messages, activeSession?.id]);

  useEffect(() => {
    if (scrollAreaRef.current && !isLoading) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [activeSession?.activeMessageId, isLoading]);

  const { startIndex, endIndex, translateY, totalHeight, onScroll } = useVirtualList({
    containerHeight,
    itemHeight: 150, // Estimating average message height
    totalCount: visibleMessages.length,
    overscan: 10,
  });

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    }
  }, [activeSessionId]);

  const isTransitioning = activeSessionId && (!activeSession || activeSession.id !== activeSessionId);
  const isEmpty = !activeSession || Object.keys(activeSession.messages).length === 0;

  return (
    <div className="main-layout selection:bg-primary/20">
      <Header />
      <div className="chat-scroll-area" ref={scrollAreaRef}>
        {isTransitioning ? null : isEmpty ? (
          <div className="chat-empty-container">
            <div className="mb-3 flex flex-col items-center w-full select-none">
              <div className="header-icon-wrapper">
                <Icon name="Bot" size={24} className="text-background" />
              </div>
              <h1 className="chat-empty-title selection:bg-primary/20">{getGreeting(userName)}</h1>
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
        ) : (
          <div className="message-list-container" onScroll={onScroll}>
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ transform: `translateY(${translateY}px)` }}>
                {visibleMessages.slice(startIndex, endIndex).map((message, sliceIdx) => {
                  const idx = startIndex + sliceIdx;
                  return (
                    <ChatMessageBubble
                      key={message.id}
                      message={message}
                      sessionId={activeSession.id}
                      isLast={idx === visibleMessages.length - 1}
                      isThinking={isLoading && idx === visibleMessages.length - 1 && message.role === 'assistant'}
                      onRegenerate={() => handleRegenerate(activeSession.id, message.id)}
                      onEdit={(newContent) => handleEdit(activeSession.id, message.id, newContent)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} onStop={handleStop} isLoading={isLoading} />
    </div>
  );
};
