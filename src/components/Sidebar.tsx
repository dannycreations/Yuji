import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { Archive, Bot, MoreHorizontal, PanelLeftClose, Pin, Settings, SquarePen, Trash2, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getFlattenedThreads, sortThreadsByDate } from '../helpers/ThreadHelper';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { useChatAction, useStore, useStoreAction } from '../hooks/useStore';
import { getFirstChar } from '../utilities/CommonUtil';
import { ThreadSettingModal } from './setting/ThreadSettingModal';
import { Dropdown, DropdownItem } from './shared/Dropdown';
import { InputButton, InputSearch } from './shared/InputArea';

import type { FC } from 'react';
import type { ConfirmOptions } from '../app/Schema';

export const Sidebar: FC = () => {
  const threads = useStore((s) => s.threads);
  const userName = useStore((s) => s.settings.personalisation.userName);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const pinnedThreadIds = useStore((s) => s.pinnedThreadIds);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const backgroundThreadIds = useStore((s) => s.backgroundThreadIds);

  const setActiveThread = useStoreAction((s, id: string | null) => s.setActiveThread(id));
  const loadMoreThreads = useStoreAction((s) => s.loadMoreThreads());
  const searchThreads = useStoreAction((s, query: string) => s.searchThreads(query));
  const toggleSidebar = useStoreAction((s) => s.toggle('isSidebarOpen'));
  const toggleSetting = useStoreAction((s) => s.toggle('isSettingOpen'));
  const showConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));

  const onCreateThread = useChatAction((c) => c.createThread());
  const onDeleteThreads = useChatAction((c, id: string) => c.deleteThreads(id));

  const handleTogglePin = useStoreAction((s, id: string) => s.togglePin(id));
  const handleToggleArchive = useStoreAction((s, id: string) => s.toggleArchive(id));

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    searchThreads(searchQuery);
  }, [searchQuery, searchThreads]);

  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useResizeObserver(scrollContainerRef);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<number | null>(null);

  const flattenedThreads = useMemo(() => {
    const sorted = sortThreadsByDate(Object.values(threads));
    return getFlattenedThreads(sorted, searchQuery, pinnedThreadIds);
  }, [threads, searchQuery, pinnedThreadIds]);

  const virtualizer = useVirtualizer({
    count: flattenedThreads.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 44,
    getItemKey: (index) => {
      const item = flattenedThreads[index];
      return item.type === 'label' ? `label-${item.label}` : item.thread.id;
    },
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const [lastItem] = [...virtualItems].reverse();
    if (!lastItem) return;

    if (lastItem.index >= flattenedThreads.length - 1) {
      loadMoreThreads();
    }
  }, [virtualItems, flattenedThreads.length, loadMoreThreads]);

  const menuThreadMetadata = menuOpenId ? threads[menuOpenId] : null;

  return (
    <div className={clsx('sidebar-container', !isSidebarOpen && 'hidden')}>
      <div className="sidebar-header relative">
        <InputButton onClick={toggleSidebar} className="z-chat-input" title="Close Sidebar">
          <PanelLeftClose size={20} />
        </InputButton>

        <div className="abs-center pointer-events-none">
          <InputButton variant="logo" onClick={() => setActiveThread(null)}>
            <Bot size={20} className="text-primary" />
            <div className="header-title">Yuji</div>
          </InputButton>
        </div>

        <InputButton onClick={onCreateThread} className="z-chat-input" title="New Chat">
          <SquarePen size={20} />
        </InputButton>
      </div>

      <div className="px-2 mb-2">
        <InputSearch
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          debounceMs={150}
          placeholder="Search threads..."
          className="input-sm bg-surface/50! border-transparent! focus:border-line/30! focus:bg-surface!"
        />
      </div>

      <div
        className={clsx('sidebar-content scrollbar-autohide', isScrolling && 'scrolling')}
        ref={scrollContainerRef}
        onScroll={() => {
          setIsScrolling(true);
          if (scrollTimerRef.current) {
            window.clearTimeout(scrollTimerRef.current);
          }
          scrollTimerRef.current = window.setTimeout(() => {
            setIsScrolling(false);
            scrollTimerRef.current = null;
          }, 1500);
        }}
      >
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
              const item = flattenedThreads[virtualRow.index];
              if (item.type === 'label') {
                return (
                  <h3 key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index} className="label-caps p-2 h-[40px]">
                    {item.label}
                  </h3>
                );
              }
              const { thread } = item;
              return (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className={clsx('sidebar-thread-item group', activeThreadId === thread.id && 'sidebar-thread-item-active')}
                  onClick={() => setActiveThread(thread.id)}
                >
                  <div className="sidebar-thread-title flex items-center gap-2">
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
                          <Pin size={16} className="rotate-45" />
                        </div>
                      )
                    )}
                    <InputButton
                      ref={menuOpenId === thread.id ? menuTriggerRef : null}
                      className={clsx('sidebar-thread-action-btn', menuOpenId === thread.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === thread.id ? null : thread.id);
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </InputButton>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <InputButton variant="sidebar" onClick={toggleSetting}>
          <div className="avatar-sm">{getFirstChar(userName) || <User size={12} />}</div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium truncate">{userName || 'User'}</div>
          </div>
          <div className="text-text-tertiary flex items-center">
            <Settings size={16} />
          </div>
        </InputButton>
      </div>
      {settingsOpenId && <ThreadSettingModal threadId={settingsOpenId} onClose={() => setSettingsOpenId(null)} />}

      {menuOpenId && menuThreadMetadata && (
        <Dropdown isOpen={true} triggerRef={menuTriggerRef} onClose={() => setMenuOpenId(null)}>
          <DropdownItem
            icon={Pin}
            iconClassName={clsx(pinnedThreadIds.includes(menuOpenId) && 'rotate-45')}
            label={pinnedThreadIds.includes(menuOpenId) ? 'Unpin' : 'Pin'}
            onClick={() => {
              setMenuOpenId(null);
              handleTogglePin(menuOpenId);
            }}
          />
          <DropdownItem
            icon={Archive}
            label="Archive"
            onClick={() => {
              setMenuOpenId(null);
              handleToggleArchive(menuOpenId);
            }}
          />
          <DropdownItem
            icon={Settings}
            label="Settings"
            onClick={() => {
              setMenuOpenId(null);
              setSettingsOpenId(menuOpenId);
            }}
          />
          <DropdownItem
            icon={Trash2}
            label="Delete"
            variant="danger"
            onClick={() => {
              setMenuOpenId(null);
              showConfirm({
                title: 'Delete chat?',
                message: `This will delete **${menuThreadMetadata?.title}** permanently.`,
                confirmLabel: 'Delete',
                onConfirm: () => onDeleteThreads(menuOpenId),
                variant: 'danger',
              });
            }}
          />
        </Dropdown>
      )}
    </div>
  );
};
