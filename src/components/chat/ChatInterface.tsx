import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { Bot, Code, Compass, Network, Sparkles } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_SUGGESTIONS, SEARCH_INSTRUCTION } from '../../app/Constant';
import { getBlockVersions, getVisibleMessages } from '../../helpers/ThreadHelper';
import { getGreeting } from '../../helpers/UserHelper';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { useChatAction, useStore, useStoreAction } from '../../hooks/useStore';
import { Header } from '../Header';
import { ChatInput } from './ChatInput';
import { ChatMessageBubble } from './ChatMessageBubble';

import type { FC } from 'react';
import type { Attachment } from '../../app/Schema';

export const ChatInterface: FC = () => {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const activeThread = useStore((s) => s.activeThread);
  const showSuggestions = useStore((s) => s.settings.showSuggestions);
  const userName = useStore((s) => s.settings.personalisation.userName);

  const [pendingInput, setPendingInput] = useState<string | undefined>(undefined);

  const isLoading = useStore(
    (s) => (s.activeThreadId ? s.backgroundThreadIds.includes(s.activeThreadId) : false),
    (a, b) => a === b,
  );

  const onSend = useChatAction((c, content: string, attachments?: ReadonlyArray<Attachment>, options?: { readonly search?: boolean }) =>
    c.sendMessage(content, attachments, options?.search ? { instruction: SEARCH_INSTRUCTION } : undefined),
  );
  const onStop = useChatAction((c) => c.stop(activeThreadId || undefined));

  const loadMessages = useStoreAction((s, id: string) => s.loadMessages(id));

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { height: containerHeight } = useResizeObserver(scrollAreaRef);

  const visibleMessages = useMemo(() => (activeThread ? getVisibleMessages(activeThread) : []), [activeThread]);

  const isAtBottomRef = useRef(true);
  const [isReady, setIsReady] = useState(false);
  const lastThreadId = useRef<string | null>(null);

  const isTransitioning = activeThreadId && (!activeThread || activeThread.id !== activeThreadId);
  const isEmpty = !activeThread || Object.keys(activeThread.messages).length === 0;

  const virtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: () => 150,
    getItemKey: (index) => visibleMessages[index]?.id ?? `empty-${index}`,
    overscan: 10,
  });

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  // Reset ready state and scroll position on thread change
  useLayoutEffect(() => {
    if (activeThreadId !== lastThreadId.current) {
      lastThreadId.current = activeThreadId;
      setIsReady(false);
      isAtBottomRef.current = true;
      // Force virtualizer to clear measurements and scroll position immediately on thread change
      virtualizer.scrollToOffset(0);
    }
  }, [activeThreadId, virtualizer]);

  // Load messages for the active thread
  useEffect(() => {
    if (activeThreadId) {
      loadMessages(activeThreadId);
    }
  }, [activeThreadId, loadMessages]);

  // Handle initial scroll and ready state
  useLayoutEffect(() => {
    if (!containerHeight || isTransitioning || isEmpty) return;

    if (!isReady) {
      if (visibleMessages.length > 0) {
        virtualizer.scrollToIndex(visibleMessages.length - 1, { align: 'end' });
      }

      // Mark as ready after a short delay to allow measurements to stabilize
      const timer = setTimeout(() => {
        setIsReady(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [containerHeight, isReady, isTransitioning, isEmpty, visibleMessages.length, virtualizer]);

  // Keep scroll at bottom when content changes or during streaming
  useLayoutEffect(() => {
    if (!isReady || !isAtBottomRef.current || isTransitioning || visibleMessages.length === 0) return;

    // Use scrollToIndex for more stable behavior with virtualization
    virtualizer.scrollToIndex(visibleMessages.length - 1, { align: 'end' });
  }, [totalSize, visibleMessages.length, isReady, isTransitioning, virtualizer]);

  return (
    <div className="main-layout">
      <Header />
      <div
        className={clsx('chat-scroll-area', (!containerHeight || (!isReady && !isEmpty)) && 'opacity-0')}
        ref={scrollAreaRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          // Use a slightly larger threshold for virtualization stability
          const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 100;
          isAtBottomRef.current = isAtBottom;
        }}
      >
        {isTransitioning ? null : isEmpty ? (
          <div className="chat-empty-container">
            <div className="mb-3 flex flex-col items-center w-full select-none">
              <div className="chat-empty-icon-wrapper">
                <Bot size={24} className="text-background" />
              </div>
              <div className="chat-empty-title">{getGreeting(userName)}</div>
            </div>

            {showSuggestions && (
              <div className="suggestion-grid">
                {INITIAL_SUGGESTIONS.map((suggestion, idx) => {
                  const IconComponent =
                    {
                      Sparkles,
                      Compass,
                      Code,
                      Network,
                    }[suggestion.icon] || Bot;

                  return (
                    <button key={idx} onClick={() => setPendingInput(suggestion.prompt)} className="suggestion-item">
                      <IconComponent size={20} className="suggestion-item-icon text-text-tertiary" />
                      <div className="suggestion-item-label">{suggestion.label}</div>
                      <div className="suggestion-item-prompt">{suggestion.prompt}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="message-list-container">
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const message = visibleMessages[virtualRow.index];
                  const siblings = getBlockVersions(activeThread, message.id);

                  return (
                    <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index} className="w-full">
                      <ChatMessageBubble
                        message={message}
                        threadId={activeThread.id}
                        siblings={siblings}
                        isThinking={isLoading && virtualRow.index === visibleMessages.length - 1 && message.role === 'assistant'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <ChatInput
        onSend={(...args) => {
          setPendingInput(undefined);
          onSend(...args);
        }}
        onStop={onStop}
        isLoading={isLoading}
        initialInput={pendingInput}
      />
    </div>
  );
};
