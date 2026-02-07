import { Effect } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_SUGGESTIONS } from '../../app/Constant';
import { YujiRuntime } from '../../app/Runtime';
import { getMessagePath } from '../../helpers/SessionHelper';
import { getGreeting } from '../../helpers/UserHelper';
import { useChatAction } from '../../hooks/useChatAction';
import { useStore, useStoreAction } from '../../hooks/useStore';
import { useVirtualList } from '../../hooks/useVirtualList';
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

  const { isLoading, handleSend, stop: handleStop } = useChatAction();

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

  const { startIndex, endIndex, translateY, totalHeight, onScroll, setItemHeight } = useVirtualList({
    containerHeight,
    estimatedItemHeight: 100,
    totalCount: visibleMessages.length,
    overscan: 10,
  });

  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).getAttribute('data-id');
        if (id) {
          const index = visibleMessages.findIndex((m) => m.id === id);
          if (index !== -1) {
            setItemHeight(index, entry.contentRect.height);
          }
        }
      }
    });

    visibleMessages.slice(startIndex, endIndex).forEach((msg) => {
      const el = messageRefs.current[msg.id];
      if (el) {
        observer.observe(el);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [startIndex, endIndex, visibleMessages, setItemHeight]);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    }
  }, [activeSessionId, loadMessages]);

  const isTransitioning = activeSessionId && (!activeSession || activeSession.id !== activeSessionId);
  const isEmpty = !activeSession || Object.keys(activeSession.messages).length === 0;

  return (
    <div className="main-layout selection:bg-primary/20">
      <Header />
      <div
        className="chat-scroll-area"
        ref={scrollAreaRef}
        onScroll={(e) => {
          onScroll(e);
          if (e.currentTarget.scrollTop === 0 && !isLoading && !isEmpty) {
            YujiRuntime.runPromise(Effect.flatMap(StoreService, (s: StoreService) => s.loadMoreMessages())).catch(console.error);
          }
        }}
      >
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
          <div className="message-list-container">
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ transform: `translateY(${translateY}px)` }}>
                {visibleMessages.slice(startIndex, endIndex).map((message, sliceIdx) => {
                  const idx = startIndex + sliceIdx;
                  return (
                    <div
                      key={message.id}
                      ref={(el) => {
                        messageRefs.current[message.id] = el;
                      }}
                      data-id={message.id}
                      className="w-full"
                    >
                      <ChatMessageBubble
                        message={message}
                        sessionId={activeSession.id}
                        isLast={idx === visibleMessages.length - 1}
                        isThinking={isLoading && idx === visibleMessages.length - 1 && message.role === 'assistant'}
                      />
                    </div>
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
