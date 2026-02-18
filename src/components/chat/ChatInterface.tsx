import clsx from 'clsx';
import { Effect } from 'effect';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { INITIAL_SUGGESTIONS } from '../../app/Constant';
import { getMessagePath } from '../../helpers/ThreadHelper';
import { getGreeting } from '../../helpers/UserHelper';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { useStore, useStoreAction, useStoreEffect } from '../../hooks/useStore';
import { useVirtualList } from '../../hooks/useVirtualList';
import { ChatService } from '../../services/ChatService';
import { Header } from '../Header';
import { Icon } from '../shared/Icon';
import { ChatInput } from './ChatInput';
import { ChatMessageBubble } from './ChatMessageBubble';

import type { FC } from 'react';
import type { Attachment } from '../../app/Schema';

export const ChatInterface: FC = () => {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const activeThread = useStore((s) => s.activeThread);
  const showSuggestions = useStore((s) => s.settings.showSuggestions);
  const userName = useStore((s) => s.settings.personalisation.userName);

  const isLoading = useStore(
    (s) => (s.activeThreadId ? s.backgroundThreadIds.includes(s.activeThreadId) : false),
    (a, b) => a === b,
  );

  const handleSend = useStoreEffect((content: string, attachments?: ReadonlyArray<Attachment>, options?: { readonly search?: boolean }) =>
    Effect.flatMap(ChatService, (chat) =>
      chat.sendMessage(content, attachments, options?.search ? { instruction: 'Search the web for the latest information.' } : undefined),
    ),
  );
  const handleStop = useStoreEffect(() => Effect.flatMap(ChatService, (chat) => chat.stop(activeThreadId || undefined)));

  const loadMessages = useStoreAction((s, id: string) => s.loadMessages(id));
  const loadMoreMessages = useStoreAction((s) => s.loadMoreMessages());

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { height: containerHeight } = useResizeObserver(scrollAreaRef);

  const visibleMessages = useMemo(() => {
    if (!activeThread) return [];
    const { activeMessageId, messages } = activeThread;

    if (activeMessageId) {
      return getMessagePath(activeThread, activeMessageId);
    }

    return Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);
  }, [activeThread?.activeMessageId, activeThread?.messages]);

  const isAtBottomRef = useRef(true);

  const isTransitioning = activeThreadId && (!activeThread || activeThread.id !== activeThreadId);
  const isEmpty = !activeThread || Object.keys(activeThread.messages).length === 0;

  const { handleScroll: handleInfiniteScroll } = useInfiniteScroll({
    onLoadMore: () => {
      loadMoreMessages();
    },
    direction: 'top',
    threshold: 50,
    isLoading,
    enabled: !isEmpty,
  });

  useLayoutEffect(() => {
    const el = scrollAreaRef.current;
    if (!el || !containerHeight) return;

    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [
    visibleMessages.length,
    activeThread?.activeMessageId,
    containerHeight,
    // Trigger auto-scroll when content of the last message changes during streaming
    visibleMessages[visibleMessages.length - 1]?.content,
  ]);

  useLayoutEffect(() => {
    if (!isLoading && scrollAreaRef.current && containerHeight) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      isAtBottomRef.current = true;
    }
  }, [isLoading, containerHeight]);

  const { startIndex, endIndex, translateY, totalHeight, onScroll, measureElement, clearItemHeights } = useVirtualList({
    containerHeight,
    estimatedItemHeight: 100,
    items: visibleMessages,
    getItemKey: (m) => m.id,
    overscan: 10,
  });

  useEffect(() => {
    if (activeThreadId) {
      clearItemHeights();
      loadMessages(activeThreadId);
      isAtBottomRef.current = true;
    }
  }, [activeThreadId, loadMessages, clearItemHeights]);

  useEffect(() => {
    if (isLoading) {
      clearItemHeights();
    }
  }, [isLoading, clearItemHeights]);

  return (
    <div className="main-layout">
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
              <div className="chat-empty-icon-wrapper">
                <Icon name="Bot" size={24} className="text-background" />
              </div>
              <div className="chat-empty-title">{getGreeting(userName)}</div>
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
                    <div key={message.id} ref={measureElement} data-vkey={message.id} className="w-full">
                      <ChatMessageBubble
                        message={message}
                        threadId={activeThread.id}
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
