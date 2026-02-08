import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { INITIAL_SUGGESTIONS } from '../../app/Constant';
import { getMessagePath } from '../../helpers/ThreadHelper';
import { getGreeting } from '../../helpers/UserHelper';
import { useChatAction } from '../../hooks/useChatAction';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { useStore, useStoreAction } from '../../hooks/useStore';
import { useVirtualList } from '../../hooks/useVirtualList';
import { Header } from '../Header';
import { Icon } from '../shared/Icon';
import { ChatInput } from './ChatInput';
import { ChatMessageBubble } from './ChatMessageBubble';

import type { FC } from 'react';

export const ChatInterface: FC = () => {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const activeThread = useStore((s) => s.activeThread);
  const showSuggestions = useStore((s) => s.settings.showSuggestions);
  const userName = useStore((s) => s.settings.personalisation.userName);

  const { isLoading, handleSend, stop: handleStop } = useChatAction();

  const loadMessages = useStoreAction((s, id: string) => s.loadMessages(id));
  const loadMoreMessages = useStoreAction((s) => s.loadMoreMessages());

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { height: containerHeight } = useResizeObserver(scrollAreaRef);

  const visibleMessages = useMemo(() => {
    if (!activeThread) return [];
    if (activeThread.activeMessageId) return getMessagePath(activeThread, activeThread.activeMessageId);
    return Object.values(activeThread.messages).sort((a, b) => a.timestamp - b.timestamp);
  }, [activeThread?.activeMessageId, activeThread?.messages, activeThread?.id]);

  const isAtBottomRef = useRef(true);

  const isTransitioning = activeThreadId && (!activeThread || activeThread.id !== activeThreadId);
  const isEmpty = !activeThread || Object.keys(activeThread.messages).length === 0;

  const { handleScroll: handleInfiniteScroll } = useInfiniteScroll({
    onLoadMore: () => loadMoreMessages().catch(console.error),
    direction: 'top',
    threshold: 50,
    isLoading,
    enabled: !isEmpty,
  });

  useLayoutEffect(() => {
    const el = scrollAreaRef.current;
    if (!el || !containerHeight) return;

    if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleMessages.length, activeThread?.activeMessageId, containerHeight]);

  useLayoutEffect(() => {
    if (!isLoading && scrollAreaRef.current && containerHeight) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      isAtBottomRef.current = true;
    }
  }, [isLoading, containerHeight]);

  const { startIndex, endIndex, translateY, totalHeight, onScroll, setItemHeight, clearItemHeight, clearItemHeights } = useVirtualList({
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

    const currentRefs = messageRefs.current;
    visibleMessages.slice(startIndex, endIndex).forEach((msg) => {
      const el = currentRefs[msg.id];
      if (el) {
        observer.observe(el);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [startIndex, endIndex, visibleMessages, setItemHeight]);

  useEffect(() => {
    if (activeThreadId) {
      clearItemHeights();
      loadMessages(activeThreadId);
    }
  }, [activeThreadId, loadMessages]);

  const handleUpdateHeight = useCallback(
    (messageId: string) => {
      const index = visibleMessages.findIndex((m) => m.id === messageId);
      if (index !== -1) {
        clearItemHeight(index);
      }
    },
    [visibleMessages, clearItemHeight],
  );

  useEffect(() => {
    if (isLoading) {
      clearItemHeights();
    }
  }, [isLoading, clearItemHeights]);

  return (
    <div className="main-layout selection:bg-primary/20">
      <Header />
      <div
        className={clsx('chat-scroll-area', !containerHeight && 'opacity-0')}
        ref={scrollAreaRef}
        onScroll={(e) => {
          onScroll(e);
          handleInfiniteScroll(e);
          const el = e.currentTarget;
          const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;
          isAtBottomRef.current = isAtBottom;
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
                        threadId={activeThread.id}
                        isLast={idx === visibleMessages.length - 1}
                        isThinking={isLoading && idx === visibleMessages.length - 1 && message.role === 'assistant'}
                        onUpdateHeight={() => handleUpdateHeight(message.id)}
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
