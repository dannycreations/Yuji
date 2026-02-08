import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { filterThreads, groupThreads, sortThreadsByDate } from '../helpers/ThreadHelper';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { useStore, useStoreAction, useStoreEffect } from '../hooks/useStore';
import { useVirtualList } from '../hooks/useVirtualList';
import { ChatService } from '../services/ChatService';
import { getFirstChar } from '../utilities/CommonUtil';
import { ThreadSettingModal } from './setting/ThreadSettingModal';
import { Button } from './shared/Button';
import { Dropdown, DropdownItem } from './shared/Dropdown';
import { Icon } from './shared/Icon';
import { InputSearch } from './shared/InputArea';

import type { FC } from 'react';
import type { ChatThread, ConfirmOptions } from '../app/Schema';

export const Sidebar: FC = () => {
  const threads = useStore((s) => s.threads);
  const settings = useStore((s) => s.settings);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const pinnedThreadIds = useStore((s) => s.pinnedThreadIds);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const backgroundThreadIds = useStore((s) => s.backgroundThreadIds);

  const setActiveThread = useStoreAction((s, id: string | null) => s.setActiveThread(id));
  const loadMoreThreads = useStoreAction((s) => s.loadMoreThreads());
  const toggleSidebar = useStoreAction((s) => s.toggle('isSidebarOpen'));
  const toggleSetting = useStoreAction((s) => s.toggle('isSettingOpen'));
  const showConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));

  const handleCreateThread = useStoreEffect(() => Effect.flatMap(ChatService, (chat) => chat.createThread()));
  const handleDeleteThread = useStoreEffect((id: string) => Effect.flatMap(ChatService, (chat) => chat.deleteThread(id)));
  const handleTogglePin = useStoreAction((s, id: string) => s.togglePin(id));

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { height: containerHeight } = useResizeObserver(scrollContainerRef);

  const sortedThreads = useMemo(() => sortThreadsByDate(Object.values(threads) as ChatThread[]), [threads]);

  const filteredThreads = useMemo(() => {
    return filterThreads(sortedThreads, searchQuery);
  }, [sortedThreads, searchQuery]);

  const groupedThreads = useMemo(() => groupThreads(filteredThreads, pinnedThreadIds), [filteredThreads, pinnedThreadIds]);

  const flattenedThreads = useMemo(() => {
    const result: Array<{ type: 'label'; label: string } | { type: 'thread'; thread: ChatThread }> = [];
    const entries = Object.entries(groupedThreads);
    for (let i = 0; i < entries.length; i++) {
      const [label, group] = entries[i];
      if (group.length > 0) {
        result.push({ type: 'label', label });
        for (let j = 0; j < group.length; j++) {
          result.push({ type: 'thread', thread: group[j] as ChatThread });
        }
      }
    }
    return result;
  }, [groupedThreads]);

  const { startIndex, endIndex, translateY, totalHeight, onScroll } = useVirtualList({
    containerHeight,
    estimatedItemHeight: 44, // 40px item + 4px gap
    totalCount: flattenedThreads.length,
  });

  const { handleScroll: handleInfiniteScroll } = useInfiniteScroll({
    onLoadMore: () => {
      loadMoreThreads().catch(console.error);
    },
    direction: 'bottom',
    threshold: 100,
  });

  const menuThreadMetadata = menuOpenId ? threads[menuOpenId] : null;

  if (!isSidebarOpen) return null;

  return (
    <div className="sidebar-container">
      <div className="sidebar-header relative">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="z-chat-input" title="Close Sidebar">
          <Icon name="PanelLeftClose" size={20} />
        </Button>

        <div className="abs-center flex-center pointer-events-none">
          <button onClick={() => setActiveThread(null)} className="sidebar-logo">
            <Icon name="Bot" size={20} className="text-primary" />
            <span className="header-title">Yuji</span>
          </button>
        </div>

        <Button variant="ghost" size="icon" onClick={handleCreateThread} className="z-chat-input" title="New Chat">
          <Icon name="SquarePen" size={20} />
        </Button>
      </div>

      <div className="px-3 mb-2">
        <InputSearch
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search threads..."
          className="py-2 bg-surface/50 border-transparent focus:border-line/30 focus:bg-surface"
        />
      </div>

      <div
        className="sidebar-content"
        ref={scrollContainerRef}
        onScroll={(e) => {
          onScroll(e);
          handleInfiniteScroll(e);
        }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${translateY}px)` }}>
            {flattenedThreads.slice(startIndex, endIndex).map((item) => {
              if (item.type === 'label') {
                return (
                  <h3 key={`label-${item.label}`} className="label-caps px-2 py-2 mb-1 h-[40px] mt-1">
                    {item.label}
                  </h3>
                );
              }
              const { thread } = item;
              return (
                <div
                  key={thread.id}
                  className={clsx('sidebar-thread-item group h-[40px] mt-1', activeThreadId === thread.id && 'sidebar-thread-item-active')}
                  onClick={() => setActiveThread(thread.id)}
                >
                  <div className="sidebar-thread-title flex items-center gap-2 min-w-0">
                    <span className="block truncate">{thread.title}</span>
                  </div>

                  <div className="sidebar-thread-indicator-wrapper">
                    {backgroundThreadIds.includes(thread.id) ? (
                      <div className={clsx('flex items-center transition-opacity', menuOpenId === thread.id ? 'opacity-0' : 'group-hover:opacity-0')}>
                        <div className="sidebar-activity-indicator" />
                      </div>
                    ) : (
                      pinnedThreadIds.includes(thread.id) && (
                        <div
                          className={clsx(
                            'flex items-center text-text-tertiary transition-opacity',
                            menuOpenId === thread.id ? 'opacity-0' : 'group-hover:opacity-0',
                          )}
                        >
                          <Icon name="Pin" size={16} className="rotate-45" />
                        </div>
                      )
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={clsx(
                        '!p-1 transition-opacity absolute inset-0 bg-transparent flex-center',
                        menuOpenId === thread.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuPosition({ top: rect.top + 36, left: rect.right - 36 });
                        setMenuOpenId(menuOpenId === thread.id ? null : thread.id);
                      }}
                    >
                      <Icon name="MoreHorizontal" size={16} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <Button variant="sidebar" onClick={toggleSetting}>
          <div className="avatar-sm bg-surface-hover flex-center">
            {getFirstChar(settings.personalisation.userName) || <Icon name="User" size={12} />}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium truncate">{settings.personalisation.userName || 'User'}</div>
          </div>
          <div className="text-text-tertiary flex items-center">
            <Icon name="Settings" size={16} />
          </div>
        </Button>
      </div>
      {settingsOpenId && <ThreadSettingModal threadId={settingsOpenId} onClose={() => setSettingsOpenId(null)} />}

      {menuOpenId && menuPosition && menuThreadMetadata && (
        <Dropdown
          isOpen={true}
          position={menuPosition}
          onClose={() => {
            setMenuOpenId(null);
            setMenuPosition(null);
          }}
        >
          <DropdownItem
            icon="Pin"
            iconClassName={clsx(pinnedThreadIds.includes(menuOpenId) && 'rotate-45')}
            label={pinnedThreadIds.includes(menuOpenId) ? 'Unpin' : 'Pin'}
            onClick={() => handleTogglePin(menuOpenId)}
          />
          <DropdownItem icon="Settings" label="Settings" onClick={() => setSettingsOpenId(menuOpenId)} />
          <DropdownItem
            icon="Trash2"
            label="Delete"
            variant="danger"
            onClick={() =>
              showConfirm({
                title: 'Delete chat?',
                message: `This will delete **${menuThreadMetadata?.title}** permanently.`,
                confirmLabel: 'Delete',
                onConfirm: () => handleDeleteThread(menuOpenId),
                variant: 'danger',
              })
            }
          />
        </Dropdown>
      )}
    </div>
  );
};
